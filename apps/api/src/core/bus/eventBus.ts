import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { traceStorage } from "../../config/trace";
import { LoggerFactory } from "../../config/logger";
import type { CommandContract, EventContract } from "./bus.types";

const logger = LoggerFactory.getLogger("EventBus");

// ============================================================================
/**
 * Bus d'événements typé en mémoire pour la communication inter-domaines (EDA).
 * Expose exclusivement les méthodes typées avec contrats Zod :
 * - Commandes : registerHandler() / request()
 * - Événements : on() / emit()
 */
// ============================================================================
export class TypedEventBus {
	private bus = new EventEmitter();
	private commandHandlers = new Map<string, (input: any) => Promise<any>>();

	constructor() {
		this.bus.setMaxListeners(1000);
	}

	// ============================================================================
	/**
	 * Réinitialise tous les écouteurs et gestionnaires de commandes.
	 */
	// ============================================================================
	public reset(): void {
		this.commandHandlers.clear();
		this.bus.removeAllListeners();
	}

	// ============================================================================
	/**
	 * Enregistre le gestionnaire exclusif d'une commande métier.
	 */
	// ============================================================================
	public registerHandler<TIn extends z.ZodTypeAny, TOut extends z.ZodTypeAny>(
		command: CommandContract<TIn, TOut>,
		handler: (input: z.infer<TIn>) => Promise<z.infer<TOut>>,
	): void {
		if (this.commandHandlers.has(command.name)) {
			throw new Error(`Conflit : un gestionnaire est déjà enregistré pour la commande "${command.name}"`);
		}
		this.commandHandlers.set(command.name, handler);
	}

	// ============================================================================
	/**
	 * Exécute une commande typée (Request/Reply) et attend sa réponse.
	 */
	// ============================================================================
	public async request<TIn extends z.ZodTypeAny, TOut extends z.ZodTypeAny>(
		command: CommandContract<TIn, TOut>,
		rawInput: z.infer<TIn>,
		timeoutMs = 15000,
	): Promise<z.infer<TOut>> {
		const handler = this.commandHandlers.get(command.name);
		if (!handler) {
			throw new Error(`Aucun gestionnaire enregistré pour la commande "${command.name}"`);
		}

		// Validation runtime de l'input avec Zod
		const input = command.inputSchema.parse(rawInput);
		const requestId = randomUUID();
		const traceContext = traceStorage.getStore();
		const correlationId = traceContext?.correlationId ?? "no-trace";

		logger.debug(`[Bus:Request] Commande: "${command.name}" | reqId: "${requestId}" | corrId: "${correlationId}"`);

		const executionPromise = traceContext
			? new Promise<z.infer<TOut>>((resolve, reject) => {
					traceStorage.run(traceContext, async () => {
						try {
							const res = await handler(input);
							resolve(res);
						} catch (err) {
							reject(err);
						}
					});
				})
			: handler(input);

		let timer: NodeJS.Timeout | null = null;
		try {
			const timeoutPromise = new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					reject(new Error(`Délai d'attente dépassé pour la commande "${command.name}"`));
				}, timeoutMs);
			});

			const result = await Promise.race([executionPromise, timeoutPromise]);

			// Validation runtime de l'output avec Zod
			return command.outputSchema.parse(result);
		} finally {
			if (timer) {
				clearTimeout(timer);
			}
		}
	}

	// ============================================================================
	/**
	 * Diffuse un événement métier typé sans attendre de réponse (Fire & Forget).
	 */
	// ============================================================================
	public emit<TPayload extends z.ZodTypeAny>(event: EventContract<TPayload>, rawPayload: z.infer<TPayload>): void {
		const payload = event.payloadSchema.parse(rawPayload);
		const traceContext = this.extractTraceContext(payload) ?? traceStorage.getStore();
		const correlationId = traceContext?.correlationId ?? "no-trace";

		if (
			event.name !== "job.token_emitted" &&
			event.name !== "worker.status_changed" &&
			event.name !== "workers:status"
		) {
			logger.debug(`[Bus:Emit] Événement: "${event.name}" | corrId: "${correlationId}"`);
		}

		this.bus.emit(`event:${event.name}`, payload);
	}

	// ============================================================================
	/**
	 * Abonne un écouteur à un événement métier typé avec propagation de trace.
	 */
	// ============================================================================
	public on<TPayload extends z.ZodTypeAny>(
		event: EventContract<TPayload>,
		handler: (payload: z.infer<TPayload>) => void,
	): () => void {
		const wrapped = (payload: z.infer<TPayload>) => {
			const traceContext = this.extractTraceContext(payload) ?? traceStorage.getStore();
			if (traceContext) {
				traceStorage.run(traceContext, () => handler(payload));
			} else {
				handler(payload);
			}
		};

		this.bus.on(`event:${event.name}`, wrapped);
		return () => this.bus.off(`event:${event.name}`, wrapped);
	}

	// ============================================================================
	/**
	 * Extrait le contexte de corrélation et d'authentification depuis le payload.
	 */
	// ============================================================================
	private extractTraceContext(payload: unknown): { correlationId: string; userId?: string; email?: string } | null {
		if (!payload || typeof payload !== "object") return null;

		const p = payload as {
			correlationId?: string;
			userId?: string;
			email?: string;
			userEmail?: string;
			envelope?: {
				data?: {
					correlationId?: string;
					userId?: string;
					email?: string;
				};
			};
		};

		const correlationId = p.correlationId ?? p.envelope?.data?.correlationId;
		const userId = p.userId ?? p.envelope?.data?.userId;
		const email = p.email ?? p.envelope?.data?.email ?? p.userEmail;

		if (correlationId || userId || email) {
			return {
				correlationId: correlationId || `trace-${Date.now()}`,
				userId,
				email,
			};
		}
		return null;
	}
}

export const eventBus = new TypedEventBus();
export { TypedEventBus as EventBus };
