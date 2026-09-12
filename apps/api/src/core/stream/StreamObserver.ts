import { redisStream } from "../../config/redis";
import { LoggerFactory } from "../../config/logger";
import { createSafeInterval, type SafeIntervalHandle } from "../scheduler";
import type { RedisWireMessage } from "./stream.types";

const logger = LoggerFactory.getLogger("StreamObserver");

export interface TrackedStreamInfo {
	streamKey: string;
	entityId: string;
	lastId: string;
	lastAccess: number;
	registeredAt: number;
	lastPolledAt: number;
	pollIntervalMs: number;
	terminalEvents: string[];
	timeoutMs?: number;
}

export type StreamEventHandler = (
	streamKey: string,
	message: RedisWireMessage,
	rawMessageId: string,
) => Promise<void> | void;

export type StreamTimeoutHandler = (entityId: string, streamKey: string) => Promise<void> | void;

// ============================================================================
/**
 * Observateur centralisé et performant des flux Redis Streams de réponses.
 * Respecte à la milliseconde la fréquence (pollIntervalMs) configurée par file,
 * applique le découpage par lots de 50 clés (chunking), l'isolation anti-poison-pill
 * et la purge automatique anti-fuite.
 */
// ============================================================================
export class StreamObserver {
	private activeStreams = new Map<string, TrackedStreamInfo>();
	private eventHandlers = new Set<StreamEventHandler>();
	private timeoutHandlers = new Set<StreamTimeoutHandler>();

	private pollTask: SafeIntervalHandle | null = null;
	private pruneTask: SafeIntervalHandle | null = null;
	private isPolling = false;

	private static readonly TICK_INTERVAL_MS = 100;
	private static readonly CHUNK_SIZE = 50;

	// ============================================================================
	/**
	 * Enregistre un flux de réponse à surveiller avec sa fréquence exacte.
	 */
	// ============================================================================
	public trackStream(config: {
		streamKey: string;
		entityId: string;
		pollIntervalMs?: number;
		tier?: "fast" | "slow";
		terminalEvents?: string[];
		timeoutMs?: number;
		initialLastId?: string;
	}): void {
		const now = Date.now();
		const interval = config.pollIntervalMs ?? (config.tier === "fast" ? 100 : 5000);

		this.activeStreams.set(config.streamKey, {
			streamKey: config.streamKey,
			entityId: config.entityId,
			lastId: config.initialLastId ?? "0-0",
			lastAccess: now,
			registeredAt: now,
			lastPolledAt: 0, // 0 pour déclencher une première vérification immédiate
			pollIntervalMs: interval,
			terminalEvents: config.terminalEvents ?? [],
			timeoutMs: config.timeoutMs,
		});

		logger.debug(
			`[StreamObserver] Flux ${config.streamKey} enregistré (Fréquence: ${interval}ms). Total actifs: ${this.activeStreams.size}`,
		);
	}

	// ============================================================================
	/**
	 * Désenregistre un flux de la surveillance.
	 */
	// ============================================================================
	public removeStream(streamKey: string): void {
		if (this.activeStreams.delete(streamKey)) {
			logger.debug(`[StreamObserver] Flux ${streamKey} désinscrit. Reste: ${this.activeStreams.size}`);
		}
	}

	// ============================================================================
	/**
	 * Vérifie si un flux est actuellement sous surveillance.
	 */
	// ============================================================================
	public isTracking(streamKey: string): boolean {
		return this.activeStreams.has(streamKey);
	}

	// ============================================================================
	/**
	 * Nombre total de flux actifs sous surveillance.
	 */
	// ============================================================================
	public get activeCount(): number {
		return this.activeStreams.size;
	}

	// ============================================================================
	/**
	 * Enregistre un gestionnaire d'événement de flux.
	 */
	// ============================================================================
	public onEvent(handler: StreamEventHandler): () => void {
		this.eventHandlers.add(handler);
		return () => this.eventHandlers.delete(handler);
	}

	// ============================================================================
	/**
	 * Enregistre un gestionnaire d'expiration / timeout de flux.
	 */
	// ============================================================================
	public onTimeout(handler: StreamTimeoutHandler): () => void {
		this.timeoutHandlers.add(handler);
		return () => this.timeoutHandlers.delete(handler);
	}

	// ============================================================================
	/**
	 * Démarre le planificateur de polling cadencé.
	 */
	// ============================================================================
	public start(): void {
		if (!this.pollTask) {
			this.pollTask = createSafeInterval(async () => this.pollDueStreams(), {
				name: "StreamObserverPollLoop",
				intervalMs: StreamObserver.TICK_INTERVAL_MS,
				runImmediately: false,
			});
			this.pollTask.start();
		}

		if (!this.pruneTask) {
			this.pruneTask = createSafeInterval(async () => this.pruneExpiredStreams(), {
				name: "StreamObserverPruneLoop",
				intervalMs: 30000,
				runImmediately: false,
			});
			this.pruneTask.start();
		}

		logger.info("[StreamObserver] Moteur de streaming démarré (Tick 100ms adaptatif).");
	}

	// ============================================================================
	/**
	 * Arrête le planificateur de polling.
	 */
	// ============================================================================
	public stop(): void {
		this.pollTask?.stop();
		this.pruneTask?.stop();

		this.pollTask = null;
		this.pruneTask = null;

		logger.info("[StreamObserver] Moteur de streaming arrêté.");
	}

	// ============================================================================
	/**
	 * Sélectionne et interroge tous les flux dont le délai pollIntervalMs est écoulé.
	 */
	// ============================================================================
	public async pollDueStreams(): Promise<void> {
		if (this.isPolling) return;
		this.isPolling = true;

		try {
			const now = Date.now();
			const dueStreams: TrackedStreamInfo[] = [];

			for (const info of this.activeStreams.values()) {
				if (now - info.lastPolledAt >= info.pollIntervalMs) {
					dueStreams.push(info);
					info.lastPolledAt = now;
				}
			}

			if (dueStreams.length === 0) return;

			logger.debug(`Nombre de flux à interroger: ${dueStreams.length}`);

			// Découpage par lots de 50 clés
			const chunks: TrackedStreamInfo[][] = [];
			for (let i = 0; i < dueStreams.length; i += StreamObserver.CHUNK_SIZE) {
				chunks.push(dueStreams.slice(i, i + StreamObserver.CHUNK_SIZE));
			}

			// Exécution en parallèle sur le pool de connexions RESP2
			await Promise.all(chunks.map((chunk) => this.pollChunk(chunk)));
		} catch (error) {
			logger.error("[StreamObserver] Erreur lors du polling des flux échus", error as Error);
		} finally {
			this.isPolling = false;
		}
	}

	// ============================================================================
	/**
	 * Interroge un lot de flux Redis via une commande xRead groupée.
	 */
	// ============================================================================
	private async pollChunk(chunk: TrackedStreamInfo[]): Promise<void> {
		const streamsArg = chunk.map((info) => ({
			key: info.streamKey,
			id: info.lastId,
		}));

		try {
			const results = await redisStream.xRead(streamsArg, { COUNT: 100 });
			if (!results || !Array.isArray(results)) return;

			for (const { name: streamKey, messages } of results) {
				const info = this.activeStreams.get(streamKey);
				if (!info) continue;

				for (const { id: rawMessageId, message } of messages) {
					try {
						const wireMessage: RedisWireMessage = {
							event: message.event || "unknown",
							data: message.data,
							correlationId: message.correlationId,
							timestamp: Number(message.timestamp),
						};

						// Notification de tous les gestionnaires
						for (const handler of this.eventHandlers) {
							await handler(streamKey, wireMessage, rawMessageId);
						}

						// Vérification de fin de flux (terminal event)
						if (info.terminalEvents.includes(wireMessage.event)) {
							this.removeStream(streamKey);
							break;
						}
					} catch (err) {
						logger.error(
							`[StreamObserver] Erreur de traitement sur le message ${rawMessageId} du flux ${streamKey}`,
							err,
						);
					} finally {
						// Avance toujours le curseur lastId (anti-poison-pill) si il existe encore
						const currentInfo = this.activeStreams.get(streamKey);
						if (currentInfo) {
							currentInfo.lastId = rawMessageId;
							currentInfo.lastAccess = Date.now();
						}
					}
				}
			}
		} catch (err) {
			logger.error("[StreamObserver] Erreur d'E/S xRead sur le lot Redis", err as Error);
		}
	}

	// ============================================================================
	/**
	 * Purge les flux inactifs ou ayant dépassé leur seuil d'expiration.
	 */
	// ============================================================================
	public pruneExpiredStreams(): void {
		const now = Date.now();
		const defaultInactivityThreshold = 1 * 60 * 60 * 1000; // 1 heures par défaut

		for (const [streamKey, info] of Array.from(this.activeStreams.entries())) {
			const timeoutThreshold = info.timeoutMs ?? defaultInactivityThreshold;
			const isExpired = now - info.lastAccess > timeoutThreshold || now - info.registeredAt > timeoutThreshold;

			if (isExpired) {
				this.removeStream(streamKey);
				logger.info(`[StreamObserver] Flux ${streamKey} (Entity: ${info.entityId}) expiré et purgé de la mémoire.`);

				for (const handler of this.timeoutHandlers) {
					try {
						handler(info.entityId, streamKey);
					} catch (err) {
						logger.error(`[StreamObserver] Erreur dans le timeoutHandler pour ${info.entityId}`, err);
					}
				}
			}
		}
	}
}

export const streamObserver = new StreamObserver();
