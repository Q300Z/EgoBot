import type { Request, Response } from "express";
import { redisStream } from "../../config/redis";
import { eventBus } from "../bus/eventBus";
import { LoggerFactory } from "../../config/logger";
import type { JobEventEnvelope } from "../../modules/job";
import { JobEvents } from "../../modules/job/job.events";

const logger = LoggerFactory.getLogger("SseService");

// ============================================================================
/**
 * Session SSE native encapsulant la réponse HTTP Express et gérant le streaming.
 */
// ============================================================================
export class BufferedSession {
	private lastSentEventId: string | null = null;
	private closed = false;

	constructor(
		private res: Response,
		private jobId?: string,
	) {
		res.on("close", () => {
			this.closed = true;
		});
	}

	// ============================================================================
	/**
	 * Indique si la connexion HTTP sous-jacente est toujours active et accessible.
	 */
	// ============================================================================
	public get isConnected(): boolean {
		return !this.closed && !this.res.writableEnded;
	}

	// ============================================================================
	/**
	 * Émet un événement SSE vers le client avec déduplication d'identifiant.
	 */
	// ============================================================================
	public push(data: unknown, event = "message", id?: string): void {
		if (this.closed || this.res.writableEnded) return;

		if (id && this.lastSentEventId && this.compareRedisIds(id, this.lastSentEventId) <= 0) {
			return;
		}

		try {
			const eventStr = event ? `event: ${event}\n` : "";
			const idStr = id ? `id: ${id}\n` : "";
			const dataStr = `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
			this.res.write(`${eventStr}${idStr}${dataStr}`);
			if (id) {
				this.lastSentEventId = id;
			}
			if (typeof (this.res as any).flush === "function") {
				(this.res as any).flush();
			}
		} catch (err) {
			logger.warn(`Erreur push SSE pour le job ${this.jobId || "inconnu"}`, err);
		}
	}

	// ============================================================================
	/**
	 * Écoute les événements du cycle de vie de la session (ex: "disconnected").
	 */
	// ============================================================================
	public on(event: string, callback: (...args: unknown[]) => void): void {
		if (event === "disconnected") {
			this.res.on("close", callback);
		}
	}

	// ============================================================================
	/**
	 * Ferme proprement la session SSE et termine la réponse HTTP sous-jacente.
	 */
	// ============================================================================
	public destroy(): void {
		if (this.closed || this.res.writableEnded) return;
		this.closed = true;
		setTimeout(() => {
			try {
				this.res.end();
			} catch (e) {
				// Ignorer
			}
		}, 50);
	}

	// ============================================================================
	/**
	 * Compare deux identifiants de flux Redis Stream (timestamp-seq).
	 */
	// ============================================================================
	private compareRedisIds(a: string, b: string): number {
		const [aTime, aSeq] = a.split("-").map(Number);
		const [bTime, bSeq] = b.split("-").map(Number);

		if (aTime !== bTime) {
			return aTime - bTime;
		}
		return aSeq - bSeq;
	}
}

const activeSessions = new Map<string, Set<BufferedSession>>();

// ============================================================================
/**
 * Service central de gestion et de diffusion des flux Server-Sent Events (SSE).
 */
// ============================================================================
export class SseService {
	private static initialized = false;

	// ============================================================================
	/**
	 * Initialise le service SSE et abonne le diffuseur à l'EventBus.
	 */
	// ============================================================================
	public static init(): void {
		if (this.initialized) return;
		this.initialized = true;

		eventBus.on(JobEvents.tokenEmitted, ({ jobId, eventId, envelope }) => {
			try {
				// Récupération des sessions spécifiques au job et des sessions admin inscrites à la conversation
				const jobSessions: Set<BufferedSession> = this.getSessions(jobId) || new Set();
				const conversationId = "conversation_id" in envelope.data ? String(envelope.data.conversation_id) : undefined;
				const convSessions: Set<BufferedSession> = conversationId
					? this.getSessions(`conv:${conversationId}`) || new Set()
					: new Set();

				const targetSessions = new Set<BufferedSession>([...jobSessions, ...convSessions]);

				if (targetSessions.size > 0) {
					logger.debug(
						`Diffusion SSE de ${envelope.event} (id: ${eventId}) pour le job ${jobId} vers ${targetSessions.size} sessions.`,
					);
					const frontendPayload = this.toFrontendPayload(envelope);
					for (const session of targetSessions) {
						session.push(frontendPayload, envelope.event, eventId);
						if (
							envelope.event === "job.completed" ||
							envelope.event === "job.failed" ||
							envelope.event === "job.cancelled"
						) {
							// Seules les sessions propres au job individuel se ferment à la fin du job
							if (jobSessions.has(session)) {
								logger.info(
									`Session SSE de job détruite suite à l'état terminal ${envelope.event} pour le job ${jobId}`,
								);
								session.destroy();
							}
						}
					}
				}
			} catch (error) {
				logger.error("Erreur lors de la diffusion SSE depuis l'Event Bus", error);
			}
		});

		logger.info("SseService initialisé.");
	}

	// ============================================================================
	/**
	 * Enregistre une session active pour un identifiant de ressource donné.
	 */
	// ============================================================================
	public static registerSession(jobId: string, session: BufferedSession): void {
		if (!activeSessions.has(jobId)) {
			activeSessions.set(jobId, new Set());
		}
		activeSessions.get(jobId)!.add(session);

		session.on("disconnected", () => {
			logger.info(`Session SSE déconnectée (${jobId}), retrait du registre.`);
			const set = activeSessions.get(jobId);
			if (set) {
				set.delete(session);
				if (set.size === 0) {
					activeSessions.delete(jobId);
				}
			}
		});
	}

	// ============================================================================
	/**
	 * Enregistre une session SSE pour superviser une conversation entière.
	 */
	// ============================================================================
	public static registerConversationSession(conversationId: string, session: BufferedSession): void {
		this.registerSession(`conv:${conversationId}`, session);
	}

	// ============================================================================
	/**
	 * Récupère l'ensemble des sessions connectées à un identifiant donné.
	 */
	// ============================================================================
	public static getSessions(jobId: string): Set<BufferedSession> | undefined {
		return activeSessions.get(jobId);
	}

	// ============================================================================
	/**
	 * Initialise une session SSE dédiée au streaming des tokens d'un job.
	 */
	// ============================================================================
	public static async setupJobSession(req: Request, res: Response, jobId?: string): Promise<BufferedSession> {
		const origin = req.headers.origin || "*";
		res.writeHead(200, {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
			"Access-Control-Allow-Origin": origin,
			"Access-Control-Allow-Credentials": "true",
		});
		res.write("retry: 2000\n\n");
		if (typeof (res as any).flush === "function") {
			(res as any).flush();
		}

		return new BufferedSession(res, jobId);
	}

	// ============================================================================
	/**
	 * Initialise une session SSE dédiée à la supervision admin d'une conversation.
	 */
	// ============================================================================
	public static async setupConversationSession(
		req: Request,
		res: Response,
		conversationId?: string,
	): Promise<BufferedSession> {
		const origin = req.headers.origin || "*";
		res.writeHead(200, {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
			"Access-Control-Allow-Origin": origin,
			"Access-Control-Allow-Credentials": "true",
		});
		res.write("retry: 2000\n\n");
		if (typeof (res as any).flush === "function") {
			(res as any).flush();
		}

		const key = conversationId ? `conv:${conversationId}` : undefined;
		return new BufferedSession(res, key);
	}

	// ============================================================================
	/**
	 * Initialise une session SSE dédiée à la diffusion du statut des workers.
	 */
	// ============================================================================
	public static async setupStatusSession(_req: Request, res: Response): Promise<BufferedSession> {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		});
		res.write("retry: 2000\n\n");
		if (typeof (res as any).flush === "function") {
			(res as any).flush();
		}
		return new BufferedSession(res);
	}

	// ============================================================================
	/**
	 * Formate l'enveloppe d'événement interne vers le format attendu par le client.
	 */
	// ============================================================================
	public static toFrontendPayload(envelope: JobEventEnvelope): unknown {
		if (envelope.event === "job.progress") {
			if (envelope.data.kind === "token") {
				return {
					kind: "token",
					status: "IN_PROGRESS",
					chunk: envelope.data.chunk,
				};
			}
		}
		if (envelope.event === "source") {
			return {
				kind: "source",
				status: "IN_PROGRESS",
				chunk: (envelope.data as any).chunk,
				source: (envelope.data as any).source,
			};
		}
		return envelope.data;
	}

	// ============================================================================
	/**
	 * Rejoue l'historique des événements Redis Stream vers la session connectée.
	 */
	// ============================================================================
	public static async syncHistory(
		jobId: string,
		session: BufferedSession,
		env: "dev" | "prod" = "prod",
		lastEventId?: string,
	): Promise<void> {
		try {
			const startId = lastEventId ? `(${lastEventId}` : "-";
			let messages = await redisStream.xRange(`jobs:sse:${env}:${jobId}`, startId, "+");
			if (!messages || messages.length === 0) {
				const altEnv = env === "dev" ? "prod" : "dev";
				const altMessages = await redisStream.xRange(`jobs:sse:${altEnv}:${jobId}`, startId, "+");
				if (altMessages && altMessages.length > 0) {
					messages = altMessages;
				}
			}

			if (messages && messages.length > 0) {
				logger.info(
					`Synchronisation de ${messages.length} messages d'historique pour le job ${jobId} depuis l'index ${startId}`,
				);
				for (const msg of messages as unknown as Array<{ id: string; message: Record<string, string> }>) {
					try {
						const rawData = msg.message.data || msg.message.payload;
						const parsed = JSON.parse(rawData) as unknown;

						const envelopeData =
							parsed && typeof parsed === "object" && "event" in parsed
								? parsed
								: { event: msg.message.event, data: parsed };

						const envelope = envelopeData as JobEventEnvelope;

						session.push(this.toFrontendPayload(envelope), envelope.event, msg.id);

						if (
							envelope.event === "job.completed" ||
							envelope.event === "job.failed" ||
							envelope.event === "job.cancelled"
						) {
							logger.info(
								`Historique synchronisé avec état terminal ${envelope.event} pour le job ${jobId}. Clôture de la session.`,
							);
							session.destroy();
						}
					} catch (error) {
						logger.error(`Erreur de parsing historique pour le job ${jobId}`, error);
					}
				}
			}
		} catch (error) {
			logger.error(`Échec de la récupération de l'historique Redis pour le job ${jobId}`, error);
		}
	}

	// ============================================================================
	/**
	 * Branche une session au registre et renvoie une fonction de désabonnement.
	 */
	// ============================================================================
	public static connectToBus(jobId: string, session: BufferedSession): () => void {
		logger.info(`Branchement de la session au registre pour le job ${jobId}`);
		this.registerSession(jobId, session);

		return () => {
			const set = activeSessions.get(jobId);
			if (set) {
				set.delete(session);
				if (set.size === 0) {
					activeSessions.delete(jobId);
				}
			}
		};
	}

	// ============================================================================
	/**
	 * Alias de liaison d'une session à un flux de job.
	 */
	// ============================================================================
	public static async attachSession(
		jobId: string,
		session: BufferedSession,
		env: "dev" | "prod" = "prod",
		lastEventId?: string,
	): Promise<void> {
		await this.attachJobSession(jobId, session, env, lastEventId);
	}

	// ============================================================================
	/**
	 * Enregistre une session et synchronise l'historique Redis passé.
	 */
	// ============================================================================
	public static async attachJobSession(
		jobId: string,
		session: BufferedSession,
		env: "dev" | "prod" = "prod",
		lastEventId?: string,
	): Promise<void> {
		this.connectToBus(jobId, session);
		await this.syncHistory(jobId, session, env, lastEventId);
	}

	// ============================================================================
	/**
	 * Branche une session d'administration au flux complet d'une conversation.
	 */
	// ============================================================================
	public static connectConversationToBus(conversationId: string, session: BufferedSession): () => void {
		const key = `conv:${conversationId}`;
		logger.info(`Branchement de la session d'administration live pour la conversation ${conversationId}`);
		this.registerSession(key, session);

		return () => {
			const set = activeSessions.get(key);
			if (set) {
				set.delete(session);
				if (set.size === 0) {
					activeSessions.delete(key);
				}
			}
		};
	}

	// ============================================================================
	/**
	 * Enregistre une session admin et synchronise l'historique d'un job actif.
	 */
	// ============================================================================
	public static async attachConversationAdminSession(
		conversationId: string,
		session: BufferedSession,
		activeJobId?: string,
		env: "dev" | "prod" = "prod",
		lastEventId?: string,
	): Promise<void> {
		this.connectConversationToBus(conversationId, session);
		if (activeJobId) {
			await this.syncHistory(activeJobId, session, env, lastEventId);
		}
	}
}

export const sseDeliveryService = SseService;
