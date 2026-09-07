import type { z } from "zod";
import { redisWriter } from "../../config/redis";
import { LoggerFactory } from "../../config/logger";
import { traceStorage } from "../../config/trace";
import { getAppEnv } from "../../config/env";
import { StreamKeys } from "./streamKeys";
import { streamObserver, StreamObserver } from "./StreamObserver";
import type { RedisWireMessage, StreamEventContract, WorkerQueueContract } from "./stream.types";

const logger = LoggerFactory.getLogger("RedisStreamBus");

export interface StreamEventContext<TPayload> {
	entityId: string;
	payload: TPayload;
	rawMessageId: string;
	streamKey: string;
}

export type StreamEventListener<TPayload> = (ctx: StreamEventContext<TPayload>) => Promise<void> | void;

// ============================================================================
/**
 * Façade unifiée et fortement typée pour la publication et l'écoute des flux Redis Streams.
 */
// ============================================================================
export class RedisStreamBus {
	private observer: StreamObserver;
	private listeners = new Map<string, Set<(ctx: StreamEventContext<any>) => Promise<void> | void>>();
	private unsubscribeObserver: (() => void) | null = null;

	constructor(observerInstance: StreamObserver = streamObserver) {
		this.observer = observerInstance;
		this.init();
	}

	private init(): void {
		this.unsubscribeObserver = this.observer.onEvent(async (streamKey, message, rawMessageId) => {
			await this.dispatchStreamEvent(streamKey, message, rawMessageId);
		});
	}

	// ============================================================================
	/**
	 * Publie une requête dans la file d'un worker et active la surveillance de la réponse.
	 */
	// ============================================================================
	public async publishRequest<TRequest extends z.ZodTypeAny, TEvents extends Record<string, StreamEventContract<any>>>(
		queue: WorkerQueueContract<TRequest, TEvents>,
		entityId: string,
		rawPayload: z.infer<TRequest>,
		options?: {
			env?: "dev" | "prod" | string;
			eventName?: string;
			timeoutMs?: number;
		},
	): Promise<void> {
		const env = options?.env ?? getAppEnv();
		const validatedPayload = queue.requestSchema.parse(rawPayload);
		const correlationId = traceStorage.getStore()?.correlationId ?? "no-trace";

		const queueKey = StreamKeys.queue(env, queue.workerType);
		const sseKey = StreamKeys.sse(env, entityId);
		const jobEnvKey = StreamKeys.jobEnv(entityId);

		const eventName = options?.eventName ?? `${queue.workerType.toLowerCase()}.created`;

		const messagePayload: RedisWireMessage = {
			event: eventName,
			data: typeof validatedPayload === "string" ? validatedPayload : JSON.stringify(validatedPayload),
			correlationId,
			timestamp: Date.now(),
		};

		// 1. Écriture atomique dans Redis
		await redisWriter
			.multi()
			.xAdd(queueKey, "*", this.toRedisFields(messagePayload))
			.expire(queueKey, 43_200) // TTL 12h
			.set(jobEnvKey, env, { EX: 43_200 })
			.exec();

		logger.info(`[RedisStreamBus] Requête ${entityId} publiée sur ${queueKey} (corrId: ${correlationId})`);

		// 2. Enregistrement automatique dans l'observateur
		this.observer.trackStream({
			streamKey: sseKey,
			entityId,
			pollIntervalMs: queue.pollIntervalMs,
			terminalEvents: queue.terminalEvents,
			timeoutMs: options?.timeoutMs,
		});
	}

	// ============================================================================
	/**
	 * Publie un événement intermédiaire ou terminal sur le flux de réponse (ex: tokens SSE).
	 */
	// ============================================================================
	public async publishToResponse<TPayload extends z.ZodTypeAny>(
		event: StreamEventContract<TPayload>,
		entityId: string,
		rawPayload: z.infer<TPayload>,
		options?: { env?: "dev" | "prod" | string },
	): Promise<void> {
		const env = options?.env ?? getAppEnv();
		const validatedPayload = event.payloadSchema.parse(rawPayload);
		const streamKey = StreamKeys.sse(env, entityId);
		const correlationId = traceStorage.getStore()?.correlationId;

		const messagePayload: RedisWireMessage = {
			event: event.name,
			data: typeof validatedPayload === "string" ? validatedPayload : JSON.stringify(validatedPayload),
			correlationId,
			timestamp: Date.now(),
		};

		await redisWriter.multi().xAdd(streamKey, "*", this.toRedisFields(messagePayload)).expire(streamKey, 43_200).exec();
	}

	// ============================================================================
	/**
	 * Abonne un gestionnaire typé à un événement de réponse Redis.
	 */
	// ============================================================================
	public on<TPayload extends z.ZodTypeAny>(
		event: StreamEventContract<TPayload>,
		handler: StreamEventListener<z.infer<TPayload>>,
	): () => void {
		let set = this.listeners.get(event.name);
		if (!set) {
			set = new Set();
			this.listeners.set(event.name, set);
		}

		set.add(handler);
		return () => {
			const currentSet = this.listeners.get(event.name);
			currentSet?.delete(handler);
		};
	}

	// ============================================================================
	/**
	 * Dispatche un message brut reçu de Redis vers les gestionnaires abonnés.
	 */
	// ============================================================================
	public async dispatchStreamEvent(streamKey: string, message: RedisWireMessage, rawMessageId: string): Promise<void> {
		const listeners = this.listeners.get(message.event);
		if (!listeners || listeners.size === 0) return;

		// Extraction de l'entityId depuis streamKey: "jobs:sse:<env>:<entityId>"
		const parts = streamKey.split(":");
		const entityId = parts.length >= 4 ? parts.slice(3).join(":") : streamKey;

		let parsedData: any = message.data;
		try {
			if (typeof message.data === "string") {
				parsedData = JSON.parse(message.data);
			}
		} catch {
			parsedData = message.data;
		}

		const ctx: StreamEventContext<any> = {
			entityId,
			payload: parsedData,
			rawMessageId,
			streamKey,
		};

		const correlationId = message.correlationId ?? "no-trace";

		for (const listener of listeners) {
			try {
				if (correlationId !== "no-trace") {
					await traceStorage.run({ correlationId }, async () => {
						await listener(ctx);
					});
				} else {
					await listener(ctx);
				}
			} catch (err) {
				logger.error(`[RedisStreamBus] Erreur dans le listener pour l'événement ${message.event}`, err);
			}
		}
	}

	// ============================================================================
	/**
	 * Vérifie si une entité est actuellement suivie par l'observateur.
	 */
	// ============================================================================
	public isTracking(entityId: string, env?: string): boolean {
		if (env) {
			return this.observer.isTracking(StreamKeys.sse(env, entityId));
		}
		return (
			this.observer.isTracking(StreamKeys.sse("prod", entityId)) ||
			this.observer.isTracking(StreamKeys.sse("dev", entityId))
		);
	}

	// ============================================================================
	/**
	 * Démarre le moteur de streaming.
	 */
	// ============================================================================
	public start(): void {
		this.observer.start();
	}

	// ============================================================================
	/**
	 * Arrête le moteur de streaming et nettoie les ressources.
	 */
	// ============================================================================
	public stop(): void {
		this.observer.stop();
		if (this.unsubscribeObserver) {
			this.unsubscribeObserver();
			this.unsubscribeObserver = null;
		}
		this.listeners.clear();
	}

	// ============================================================================
	/**
	 * Convertit un message RedisWireMessage en un objet de champs Redis.
	 */
	// ============================================================================
	public toRedisFields(message: RedisWireMessage): Record<string, string> {
		return {
			event: message.event,
			data: message.data,
			...(message.correlationId !== undefined && {
				correlationId: message.correlationId,
			}),
			timestamp: String(message.timestamp),
		};
	}
}

export const redisStreamBus = new RedisStreamBus();
