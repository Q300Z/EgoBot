import { redisReader, redisWriter, redisStream } from "../../config/redis";
import { eventBus } from "../../core/bus/eventBus";
import { createSafeInterval, type SafeIntervalHandle } from "../../core/scheduler/safeInterval";
import { StreamKeys, streamObserver } from "../../core/stream";
import { JobEvents } from "./job.events";
import { JobStreamKeys } from "./job.streams";
import { LoggerFactory } from "../../config/logger";
import type { JobEventEnvelope } from "./job.schema";

const logger = LoggerFactory.getLogger("JobStreamHandler");

// ============================================================================
/**
 * Gestionnaire d'E/S Redis pour les flux de jobs (Streams SSE, Queues d'inférence, Sorted Sets différés).
 */
// ============================================================================
export class JobStreamHandler {
	private static activeJobIds = new Set<string>();
	private static lastStreamEventIds = new Map<string, string>();
	private static jobEnvs = new Map<string, "dev" | "prod">();
	private static lastAccessTimestamps = new Map<string, number>();
	private static pollingTask: SafeIntervalHandle | null = null;
	private static polling = false;
	private static unsubscribeObserver: (() => void) | null = null;

	// ============================================================================
	/**
	 * Accesseur vers la table des environnements des jobs en mémoire.
	 */
	// ============================================================================
	public static get jobEnvsMap(): Map<string, "dev" | "prod"> {
		return this.jobEnvs;
	}

	// ============================================================================
	/**
	 * Ajoute un job au registre de surveillance en mémoire et auprès de StreamObserver.
	 */
	// ============================================================================
	public static trackJob(jobId: string, env: "dev" | "prod" = "prod"): void {
		this.activeJobIds.add(jobId);
		this.jobEnvs.set(jobId, env);
		this.lastAccessTimestamps.set(jobId, Date.now());

		// Enregistrement auprès de StreamObserver avec polling rapide (100ms) pour les tokens SSE
		streamObserver.trackStream({
			streamKey: StreamKeys.sse(env, jobId),
			entityId: jobId,
			pollIntervalMs: 500,
			terminalEvents: ["job.completed", "job.failed", "job.cancelled"],
		});
	}

	// ============================================================================
	/**
	 * Publie un événement initial dans le flux SSE Redis d'un job.
	 */
	// ============================================================================
	public static async publishToSseStream(
		env: "dev" | "prod" | string,
		jobId: string,
		eventPayload: any,
	): Promise<void> {
		const streamKey = StreamKeys.sse(env, jobId);
		const serializedPayload = JSON.stringify(eventPayload);
		const envFlag = env === "dev" ? "dev" : "prod";

		await redisWriter
			.multi()
			.xAdd(streamKey, "*", {
				event: eventPayload.event,
				data: serializedPayload,
			})
			.expire(streamKey, 43_200) // TTL 12 heures
			.set(StreamKeys.jobEnv(jobId), envFlag, { EX: 43_200 })
			.exec();

		this.trackJob(jobId, envFlag);
	}

	// ============================================================================
	/**
	 * Enfile un job dans la file active d'inférence Redis pour les workers.
	 */
	// ============================================================================
	public static async publishToInferenceQueue(
		env: "dev" | "prod" | string,
		model: string,
		eventPayload: any,
	): Promise<void> {
		const queueKey = StreamKeys.queue(env, model);
		await redisWriter.xAdd(
			queueKey,
			"*",
			{
				event: eventPayload.event,
				data: JSON.stringify(eventPayload.data),
			},
			{
				TRIM: {
					strategy: "MAXLEN",
					threshold: 1000,
					strategyModifier: "~",
				},
			},
		);
		logger.info(`Job enfilé dans la file active ${queueKey}.`);
	}

	// ============================================================================
	/**
	 * Planifie un job de manière différée dans le Sorted Set Redis.
	 */
	// ============================================================================
	public static async scheduleDeferred(score: number, payload: any): Promise<void> {
		const deferredPayload = JSON.stringify(payload);
		await redisWriter.zAdd(JobStreamKeys.deferred, { score, value: deferredPayload });
	}

	// ============================================================================
	/**
	 * Récupère la liste des jobs différés dont la date d'exécution est échue.
	 */
	// ============================================================================
	public static async getDueDeferredJobs(now: number): Promise<string[]> {
		const rawJobs = await redisReader.zRangeByScore(JobStreamKeys.deferred, 0, now);
		return rawJobs.map((j) => (typeof j === "string" ? j : (j as Buffer).toString("utf8")));
	}

	// ============================================================================
	/**
	 * Déplace de manière atomique un job différé vers sa file d'inférence active.
	 */
	// ============================================================================
	public static async releaseDeferredJob(
		env: "dev" | "prod" | string,
		model: string,
		eventPayload: any,
		rawJob: string,
	): Promise<void> {
		const queueKey = StreamKeys.queue(env, model);
		await redisWriter
			.multi()
			.xAdd(
				queueKey,
				"*",
				{
					event: eventPayload.event,
					data: JSON.stringify(eventPayload.data),
				},
				{
					TRIM: {
						strategy: "MAXLEN",
						threshold: 1000,
						strategyModifier: "~",
					},
				},
			)
			.zRem(JobStreamKeys.deferred, rawJob)
			.exec();
	}

	// ============================================================================
	/**
	 * Enregistre une clé d'annulation dans Redis pour stopper un worker actif.
	 */
	// ============================================================================
	public static async requestCancellation(jobId: string): Promise<void> {
		await redisWriter.set(StreamKeys.cancel(jobId), "1", { EX: 3600 });
	}

	// ============================================================================
	/**
	 * Vérifie si un job a fait l'objet d'une demande d'annulation.
	 */
	// ============================================================================
	public static async isCancelled(jobId: string): Promise<boolean> {
		const exists = await redisReader.exists(StreamKeys.cancel(jobId));
		return Number(exists) > 0;
	}

	// ============================================================================
	/**
	 * Supprime la clé de flux Redis SSE associée à un job.
	 */
	// ============================================================================
	public static async deleteSseStream(env: "dev" | "prod" | string, jobId: string): Promise<void> {
		const streamKey = StreamKeys.sse(env, jobId);
		await redisWriter.del(streamKey);
	}

	// ============================================================================
	/**
	 * Démarre la boucle de polling des flux SSE Redis.
	 */
	// ============================================================================
	public static startPolling(getActiveJobs?: () => Promise<Array<{ id: string }>>): void {
		if (this.pollingTask) return;

		// Initialisation unique au démarrage depuis SQLite si fournie
		if (getActiveJobs) {
			void getActiveJobs()
				.then((jobs) => {
					jobs.forEach((j) => this.trackJob(j.id));
					if (jobs.length > 0) {
						logger.info(`${jobs.length} job(s) actif(s) restauré(s) dans le registre local.`);
					}
				})
				.catch((err) => {
					logger.error("Erreur lors de la restauration initiale des jobs actifs", err);
				});
		}

		this.pollingTask = createSafeInterval(
			async () => {
				await this.pollActiveJobs();
				this.pruneStaleMemoryEntries();
			},
			{
				name: "RedisStreamsPoller",
				intervalMs: 100,
				runImmediately: false,
				onError: (err) => {
					logger.error("Erreur lors de la boucle de polling des flux Redis", err);
				},
			},
		);

		this.pollingTask.start();
	}

	// ============================================================================
	/**
	 * Arrête la boucle de polling des flux SSE.
	 */
	// ============================================================================
	public static stopPolling(): void {
		if (this.pollingTask) {
			this.pollingTask.stop();
			this.pollingTask = null;
		}
		if (this.unsubscribeObserver) {
			this.unsubscribeObserver();
			this.unsubscribeObserver = null;
		}
	}

	// ============================================================================
	/**
	 * Méthode de démarrage (compatibilité).
	 */
	// ============================================================================
	public static async start(): Promise<void> {
		this.startPolling();
	}

	// ============================================================================
	/**
	 * Méthode d'arrêt (compatibilité).
	 */
	// ============================================================================
	public static async stop(): Promise<void> {
		this.stopPolling();
	}

	// ============================================================================
	/**
	 * Enregistre un flux en cache local (compatibilité).
	 */
	// ============================================================================
	public static addStream(jobId: string, env: "dev" | "prod" = "prod"): void {
		this.trackJob(jobId, env);
	}

	// ============================================================================
	/**
	 * Supprime un flux du cache local (compatibilité).
	 */
	// ============================================================================
	public static removeStream(jobId: string, env?: string): void {
		this.cleanupJob(jobId);
		if (env) {
			streamObserver.removeStream(StreamKeys.sse(env, jobId));
		}
	}

	// ============================================================================
	/**
	 * Nettoie les caches en mémoire associés à un job.
	 */
	// ============================================================================
	public static cleanupJob(jobId: string): void {
		this.activeJobIds.delete(jobId);
		this.lastStreamEventIds.delete(jobId);
		this.jobEnvs.delete(jobId);
		this.lastAccessTimestamps.delete(jobId);

		streamObserver.removeStream(StreamKeys.sse("prod", jobId));
		streamObserver.removeStream(StreamKeys.sse("dev", jobId));
	}

	// ============================================================================
	/**
	 * Évince les entrées inactives depuis plus de 2 heures pour éviter les fuites mémoire.
	 */
	// ============================================================================
	private static pruneStaleMemoryEntries(): void {
		const now = Date.now();
		const maxAgeMs = 2 * 60 * 60 * 1000;

		for (const [jobId, timestamp] of this.lastAccessTimestamps.entries()) {
			if (now - timestamp > maxAgeMs) {
				this.cleanupJob(jobId);
			}
		}
	}

	// ============================================================================
	/**
	 * Lit les nouveaux messages sur les flux Redis des jobs actifs et diffuse les tokens.
	 */
	// ============================================================================
	public static async pollActiveJobs(getActiveJobs?: () => Promise<Array<{ id: string }>>): Promise<void> {
		if (this.polling) return;

		this.polling = true;
		try {
			let jobIds: string[];
			if (getActiveJobs) {
				const activeJobs = await getActiveJobs();
				if (!activeJobs || activeJobs.length === 0) return;
				jobIds = activeJobs.map((j) => j.id);
			} else {
				if (this.activeJobIds.size === 0) return;
				jobIds = Array.from(this.activeJobIds);
			}

			if (jobIds.length === 0) return;

			for (const jobId of jobIds) {
				const lastId = this.lastStreamEventIds.get(jobId) || "0-0";
				this.lastAccessTimestamps.set(jobId, Date.now());

				// Résolution de l'environnement
				let envFlag: "dev" | "prod" | null = this.jobEnvs.get(jobId) || null;
				if (!envFlag) {
					try {
						const redisVal = await redisReader.get(StreamKeys.jobEnv(jobId));
						if (typeof redisVal === "string" && (redisVal === "dev" || redisVal === "prod")) {
							envFlag = redisVal;
							this.jobEnvs.set(jobId, envFlag);
						}
					} catch (err) {
						logger.debug(`Erreur lors de la récupération de l'environnement Redis pour le job ${jobId}: ${err}`);
					}
				}

				let results;
				if (envFlag) {
					results = await redisStream.xRead([{ key: StreamKeys.sse(envFlag, jobId), id: lastId }], {
						COUNT: 200,
					});
				} else {
					results = await redisStream.xRead(
						[
							{ key: StreamKeys.sse("dev", jobId), id: lastId },
							{ key: StreamKeys.sse("prod", jobId), id: lastId },
						],
						{ COUNT: 200 },
					);
				}

				if (results) {
					for (const streamResult of results) {
						for (const msg of streamResult.messages) {
							const rawData = msg.message.data || msg.message.payload;
							if (!rawData) continue;

							try {
								const parsed = JSON.parse(rawData);
								const envelope =
									parsed && typeof parsed === "object" && "event" in parsed
										? parsed
										: { event: msg.message.event, data: parsed };

								const tokenPayload = {
									jobId,
									eventId: msg.id,
									env: (envFlag as "dev" | "prod") || "prod",
									envelope: envelope as JobEventEnvelope,
								};

								this.lastStreamEventIds.set(jobId, msg.id);

								try {
									// Émission typée Zod sur le bus d'événements
									eventBus.emit(JobEvents.tokenEmitted, tokenPayload);
								} catch (err) {
									logger.error(`[EMIT-ERROR]`, err);
								}
							} catch (err) {
								this.lastStreamEventIds.set(jobId, msg.id);
								logger.error(`Erreur de parsing de message du flux pour le job ${jobId}`, err);
							}
						}
					}
				}
			}
		} catch (error) {
			logger.error("Erreur lors de la boucle de polling des flux Redis", error);
		} finally {
			this.polling = false;
		}
	}
}
