import { prisma } from "../../config/db";
import { eventBus } from "../../core/bus/eventBus";
import { LoggerFactory } from "../../config/logger";
import { Status, type Model } from "@prisma/client";
import crypto from "node:crypto";
import { JobRepository } from "./JobRepository";
import { JobStreamHandler } from "./JobStreamHandler";
import { JobCommands } from "./job.commands";
import { JobEvents } from "./job.events";
import { AuthRepository } from "../auth/AuthRepository";
import { ConversationEvents } from "../conversation/conversation.events";
import { redisStream, redisWriter } from "../../config/redis";
import { JobStreamKeys } from "./job.streams";
import type { JobEventEnvelope } from "./job.schema";
import { env, getAppEnv } from "../../config/env";
import { SseService } from "../../core/sse";

const logger = LoggerFactory.getLogger("JobService");

// Variables d'état local en mémoire pour le cycle de vie
const startedJobs = new Set<string>();
const terminalJobs = new Set<string>();

// ============================================================================
/**
 * Service métier gérant le cycle de vie, la persistance et l'orchestration des jobs.
 */
// ============================================================================
export class JobService {
	private static initialized = false;

	public static get jobEnvs(): Map<string, "dev" | "prod"> {
		return JobStreamHandler.jobEnvsMap;
	}

	// ============================================================================
	/**
	 * Initialise le service et enregistre ses commandes et écouteurs d'événements.
	 */
	// ============================================================================
	public static init(): void {
		if (this.initialized) return;
		this.initialized = true;

		// 1. Enregistrement des commandes
		eventBus.registerHandler(JobCommands.create, async (input) => this.createJob(input));
		eventBus.registerHandler(JobCommands.cancel, async (input) => this.cancelJob(input));
		eventBus.registerHandler(JobCommands.defer, async (input) => this.deferJob(input));
		eventBus.registerHandler(JobCommands.getById, async ({ id }) => JobRepository.findById(id));
		eventBus.registerHandler(JobCommands.releaseDeferred, async () => this.handleDeferredJobsPoller());
		eventBus.registerHandler(JobCommands.cleanupStuck, async () => this.handleStuckJobsVerifier());

		// 2. Abonnements aux événements typés
		eventBus.on(JobEvents.createRequest, (payload) => void this.createJob(payload));
		eventBus.on(JobEvents.cancelRequest, (payload) => void this.cancelJob(payload));
		eventBus.on(JobEvents.deferRequest, (payload) => void this.deferJob(payload));
		eventBus.on(JobEvents.tokenEmitted, (payload) => void this.handleTokenEmitted(payload));
		eventBus.on(JobEvents.timeout, (payload) => void this.handleTimeout(payload));

		// Écoute de la suppression d'une conversation pour annulation propre
		eventBus.on(ConversationEvents.deleted, async ({ conversationId }) => {
			try {
				const activeJobs = await prisma.job.findMany({
					where: {
						conversation_id: conversationId,
						status: { in: [Status.PENDING, Status.IN_PROGRESS, Status.DEFERRED] },
					},
					select: { id: true },
				});
				for (const job of activeJobs) {
					await this.cancelJob({
						jobId: job.id,
						reason: "Discussion supprimée",
					});
					await JobStreamHandler.deleteSseStream("prod", job.id);
					await JobStreamHandler.deleteSseStream("dev", job.id);
					JobStreamHandler.cleanupJob(job.id);
				}
				// Clôture immédiate de toutes les sessions SSE connectées à cette conversation
				SseService.closeConversationSessions(conversationId, "Discussion supprimée");
			} catch (err) {
				logger.error(`Erreur lors du nettoyage des jobs pour la conversation ${conversationId}`, err);
			}
		});

		logger.info("JobService initialisé.");
	}

	// ============================================================================
	/**
	 * Démarre le polling des flux Redis pour les jobs en cours d'exécution.
	 */
	// ============================================================================
	public static startPolling(): void {
		logger.info("Démarrage du polling des flux Redis pour les jobs actifs.");
		JobStreamHandler.startPolling(() => JobRepository.findActiveJobs());
	}

	// ============================================================================
	/**
	 * Arrête le polling des flux Redis.
	 */
	// ============================================================================
	public static stop(): void {
		logger.info("Arrêt du polling des flux Redis pour les jobs actifs.");
		JobStreamHandler.stopPolling();
	}

	// ============================================================================
	/**
	 * Effectue une itération de lecture sur les flux Redis des jobs actifs.
	 */
	// ============================================================================
	public static async pollActiveJobs(
		getActiveJobs: () => Promise<Array<{ id: string }>> = () => JobRepository.findActiveJobs(),
	): Promise<void> {
		return JobStreamHandler.pollActiveJobs(getActiveJobs);
	}

	// ============================================================================
	/**
	 * Crée un job en base SQLite et l'enfile dans Redis pour exécution worker.
	 */
	// ============================================================================
	public static async createJob(payload: any): Promise<{ jobId: string; conversationId: string }> {
		const { jobId, conversationId, userId, userClientId, prompt, EgobotConfig, correlationId, executeAt } =
			payload || {};

		if (!jobId || !conversationId || !userId || !prompt || !EgobotConfig) {
			logger.warn("Paramètres invalides pour la création de job.");
			return { jobId: jobId || "", conversationId: conversationId || "" };
		}

		logger.info(`Création de job ${jobId} demandée`, { correlationId });

		// Règle métier : max 1 job actif par conversation
		const activeJobsCount = await JobRepository.countActiveJobsByConversation(conversationId);
		if (activeJobsCount >= 1) {
			logger.warn(`Une génération est déjà en cours pour la discussion ${conversationId}`);
			return { jobId, conversationId };
		}

		// Écriture DB transactionnelle
		let transactionResult: { conversation: any; createdJob: any } | null;
		try {
			transactionResult = await prisma.$transaction(async (tx) => {
				let conversation = await tx.conversation.findUnique({
					where: { id: conversationId },
					include: { messages: true },
				});

				if (!conversation) {
					conversation = await tx.conversation.create({
						data: {
							id: conversationId,
							user_id: userId,
							client_id: userClientId,
							title: prompt.substring(0, 40) || "Nouvelle discussion",
							model: EgobotConfig.model as Model,
						},
						include: { messages: true },
					});
				} else {
					if (conversation.user_id !== userId) {
						throw new Error("Accès refusé à cette discussion.");
					}
					await tx.conversation.update({
						where: { id: conversationId },
						data: { updated_at: new Date() },
					});
				}

				const userPromptId = crypto.randomUUID();
				const assistantMessageId = crypto.randomUUID();

				const userMessage = await tx.message.create({
					data: {
						id: userPromptId,
						conversation_id: conversationId,
						role: "USER",
						content: prompt,
					},
				});

				const assistantMessage = await tx.message.create({
					data: {
						id: assistantMessageId,
						conversation_id: conversationId,
						role: "ASSISTANT",
						content: "",
					},
				});

				const createdJob = await JobRepository.create(
					{
						id: jobId,
						conversation_id: conversationId,
						user_prompt_id: userMessage.id,
						assistant_message_id: assistantMessage.id,
						model: EgobotConfig.model as Model,
						status: executeAt ? Status.DEFERRED : Status.PENDING,
					},
					tx,
				);

				return { conversation, createdJob };
			});
		} catch (error) {
			logger.warn(`Échec de la transaction de création pour le job ${jobId}: ${error}`);
			return { jobId, conversationId };
		}

		const result = transactionResult;
		if (!result) return { jobId, conversationId };

		const appEnv = getAppEnv();
		const eventPayload = {
			event: "job.created" as const,
			data: {
				kind: "state" as const,
				status: executeAt ? ("DEFERRED" as const) : ("PENDING" as const),
				job_id: jobId,
				conversation_id: conversationId,
				data: {
					email: EgobotConfig.email,
					url: EgobotConfig.url,
					prompt,
					history: result.conversation.messages || [],
				},
			},
		};

		// Publication dans le stream SSE
		await JobStreamHandler.publishToSseStream(appEnv, result.createdJob.id, eventPayload);

		// Enfilage du job
		if (executeAt) {
			const score = new Date(executeAt).getTime();
			await JobStreamHandler.scheduleDeferred(score, {
				jobId,
				model: EgobotConfig.model,
				queueKey: JobStreamKeys.queue(appEnv, EgobotConfig.model),
				envelope: eventPayload,
			});
			logger.info(`Job ${jobId} planifié de manière différée (score: ${score}).`);
		} else {
			await JobStreamHandler.publishToInferenceQueue(appEnv, EgobotConfig.model, eventPayload);
			logger.info(`Job ${jobId} enfilé dans la file active.`);
		}

		eventBus.emit(JobEvents.createdDone, {
			jobId: result.createdJob.id,
			conversationId,
			model: EgobotConfig.model,
			correlationId,
			executeAt,
		});

		return {
			jobId: result.createdJob.id,
			conversationId,
		};
	}

	// ============================================================================
	/**
	 * Annule un job en cours et notifie les workers via Redis.
	 */
	// ============================================================================
	public static async cancelJob(payload: any): Promise<{ jobId: string; status: "CANCELLED" }> {
		const { jobId, correlationId, reason } = payload || {};
		if (!jobId) return { jobId: "", status: "CANCELLED" };

		logger.info(`Traitement d'annulation pour le job ${jobId}`, { correlationId });

		const job = await JobRepository.findById(jobId);
		if (!job) return { jobId, status: "CANCELLED" };

		if (job.status !== Status.PENDING && job.status !== Status.IN_PROGRESS && job.status !== Status.DEFERRED) {
			return { jobId, status: "CANCELLED" };
		}

		terminalJobs.add(jobId);
		startedJobs.delete(jobId);

		await prisma.$transaction(async (tx) => {
			await JobRepository.update(job.id, { status: Status.CANCELLED, ended_at: new Date() }, tx);
			const assistantMsg = await tx.message.findUnique({ where: { id: job.assistant_message_id } });
			const existingContent = assistantMsg?.content || "";
			const newContent = existingContent.trim().length > 0
				? `${existingContent}\n[Génération annulée]`
				: "<cancelled>";
			await tx.message.update({
				where: { id: job.assistant_message_id },
				data: { content: newContent },
			});
		});

		// 1. Notifier les workers via la clé Redis jobs:cancel:<jobId>
		await JobStreamHandler.requestCancellation(job.id);

		// 2. Si le job était différé, le retirer du sorted set Redis
		if (job.status === Status.DEFERRED) {
			await JobStreamHandler.removeDeferredJob(job.id);
		}

		// 3. Diffuser l'événement job.cancelled
		const cancelEnvelope: JobEventEnvelope = {
			event: "job.cancelled",
			data: {
				kind: "state",
				status: "CANCELLED",
				job_id: job.id,
				conversation_id: job.conversation_id,
				error: reason || "Job annulé par l'utilisateur.",
			},
		};

		const streamEnv = JobStreamHandler.jobEnvsMap.get(job.id) || getAppEnv();
		try {
			await JobStreamHandler.publishToSseStream(streamEnv, job.id, cancelEnvelope);
		} catch (streamErr) {
			logger.warn(`Impossible d'écrire l'annulation dans le flux SSE pour le job ${job.id}`, streamErr);
		}

		// Diffusion sur l'EventBus interne vers SseService
		eventBus.emit(JobEvents.tokenEmitted, {
			jobId: job.id,
			eventId: "cancelled",
			env: streamEnv,
			envelope: cancelEnvelope,
		});

		// Fermeture propre des sessions SSE
		SseService.closeJobSessions(job.id, reason || "Job annulé");

		// Nettoyage de la mémoire et désinscription de StreamObserver
		JobStreamHandler.cleanupJob(job.id);

		logger.info(`Job ${jobId} marqué comme annulé et nettoyé.`, { correlationId });

		return { jobId, status: "CANCELLED" };
	}

	// ============================================================================
	/**
	 * Redirige l'inférence d'un job vers un modèle d'IA alternatif.
	 */
	// ============================================================================
	public static async deferJob(payload: any): Promise<{ success: boolean; newJobId?: string }> {
		const { jobId, targetModel } = payload || {};
		if (!jobId || !targetModel) return { success: false };

		logger.info(`Redirection du job ${jobId} vers le modèle ${targetModel}`);

		const oldJob = await JobRepository.findById(jobId);
		if (!oldJob) return { success: false };

		if (oldJob.status !== "PENDING" && oldJob.status !== "IN_PROGRESS") return { success: false };

		const conversation = await prisma.conversation.findUnique({
			where: { id: oldJob.conversation_id },
			select: { user_id: true },
		});
		if (!conversation) return { success: false };

		const userConfigStr = await AuthRepository.getEgobotConfig(conversation.user_id);
		if (!userConfigStr) return { success: false };

		const newEgobotConfig = {
			...userConfigStr,
			model: targetModel as Model,
		};

		const newJobId = crypto.randomUUID();
		const newAssistantMessageId = crypto.randomUUID();

		const { newJob } = await prisma.$transaction(async (tx) => {
			await tx.message.create({
				data: {
					id: newAssistantMessageId,
					conversation_id: oldJob.conversation_id,
					role: "ASSISTANT",
					content: "",
				},
			});
			const newJob = await JobRepository.create(
				{
					id: newJobId,
					conversation_id: oldJob.conversation_id,
					user_prompt_id: oldJob.user_prompt_id,
					assistant_message_id: newAssistantMessageId,
					model: targetModel as Model,
				},
				tx,
			);
			return { newJob };
		});

		// Clôturer l'ancien job
		await prisma.$transaction(async (tx) => {
			await JobRepository.update(jobId, { status: "COMPLETED", ended_at: new Date() }, tx);
			const userPromptMsg = await tx.message.findUnique({ where: { id: oldJob.user_prompt_id } });
			await tx.message.update({
				where: { id: oldJob.assistant_message_id },
				data: { content: (userPromptMsg?.content || "") + "\n[Job redirigé vers le modèle " + targetModel + "]" },
			});
		});

		const appEnv = getAppEnv();
		const newEventPayload = {
			event: "job.created" as const,
			data: {
				kind: "state" as const,
				status: "PENDING" as const,
				job_id: newJob.id,
				conversation_id: oldJob.conversation_id,
				data: {
					email: newEgobotConfig.email,
					url: newEgobotConfig.url,
					prompt: (await prisma.message.findUnique({ where: { id: oldJob.user_prompt_id } }))?.content || "",
					history: [],
				},
			},
		};

		await JobStreamHandler.publishToInferenceQueue(appEnv, targetModel, newEventPayload);
		JobStreamHandler.trackJob(newJob.id, appEnv);

		eventBus.emit(JobEvents.createdDone, {
			jobId: newJob.id,
			conversationId: oldJob.conversation_id,
			model: targetModel,
		});

		return { success: true, newJobId: newJob.id };
	}

	// ============================================================================
	/**
	 * Traite les événements de progression (tokens) ou d'état émis par les workers.
	 */
	// ============================================================================
	public static async handleTokenEmitted(payload: any): Promise<void> {
		try {
			const { jobId, envelope, env } = payload as {
				jobId: string;
				envelope: JobEventEnvelope;
				env?: "dev" | "prod";
			};
			console.log(`JobService.handleTokenEmitted: jobId=${jobId}, event=${envelope.event}, env=${env}`);
			// Règle d'irréversibilité : si job terminal connu en mémoire, ignorer immédiatement
			if (terminalJobs.has(jobId)) {
				return;
			}

			// Règle d'irréversibilité en base : si job terminal, ignorer ou notifier l'annulation
			const job = await JobRepository.findById(jobId);
			if (job && (job.status === "CANCELLED" || job.status === "COMPLETED" || job.status === "FAILED")) {
				terminalJobs.add(jobId);
				eventBus.emit(JobEvents.cancelRequest, {
					jobId,
				});
				return;
			}

			const isToken = envelope.event === "job.progress" && envelope.data.kind === "token" && envelope.data.chunk;

			// Détection d'un token spécial de redirection de modèle
			if (isToken && envelope.data.chunk.startsWith("__DEFER_JOB__:")) {
				const parts = envelope.data.chunk.split(":");
				const targetModel = parts.length >= 2 ? parts[1] : null;
				if (targetModel) {
					eventBus.emit(JobEvents.deferRequest, {
						jobId,
						targetModel,
					});
					return;
				}
			}

			const isTerminal = ["job.completed", "job.failed", "job.cancelled"].includes(envelope.event);
			if (isTerminal) {
				terminalJobs.add(jobId);
				if (envelope.event !== "job.cancelled") {
					let fullContent = "";

					// Récupération intégrale de la réponse directement depuis le stream Redis (stateless)
					try {
						const streamEnv =
							env ||
							JobStreamHandler.jobEnvsMap.get(jobId) ||
							getAppEnv();
						let messages = await redisStream.xRange(JobStreamKeys.sse(streamEnv, jobId), "-", "+");
						if (!messages || messages.length === 0) {
							const altEnv = streamEnv === "dev" ? "prod" : "dev";
							const altMessages = await redisStream.xRange(JobStreamKeys.sse(altEnv, jobId), "-", "+");
							if (altMessages && altMessages.length > 0) {
								messages = altMessages;
							}
						}

						if (messages && messages.length > 0) {
							const redisChunks: string[] = [];
							for (const msg of messages as unknown as Array<{ id: string; message: Record<string, string> }>) {
								const rawData = msg.message.data || msg.message.payload;
								if (rawData) {
									const parsed = JSON.parse(rawData);
									const itemEnvelope =
										parsed && typeof parsed === "object" && "event" in parsed
											? parsed
											: { event: msg.message.event, data: parsed };

									if (
										(itemEnvelope.data?.kind === "token" || itemEnvelope.data?.kind === "source" || itemEnvelope.event === "source") &&
										typeof itemEnvelope.data?.chunk === "string"
									) {
										redisChunks.push(itemEnvelope.data.chunk);
									}
								}
							}
							fullContent = redisChunks.join("");
						}
					} catch (redisReadErr) {
						logger.warn(`Impossible de lire le texte complet depuis Redis pour le job ${jobId}`, redisReadErr);
					}

					const currentJob = await JobRepository.findById(jobId);
					if (currentJob) {
						const stats = envelope.event === "job.completed" ? envelope.data.statistics : undefined;
						await prisma.$transaction(async (tx) => {
							// 1. Sauvegarde du contenu intégral du message assistant
							await tx.message.update({
								where: { id: currentJob.assistant_message_id },
								data: { content: fullContent },
							});

							// 2. Mise à jour de la date d'activité de la conversation
							await tx.conversation.update({
								where: { id: currentJob.conversation_id },
								data: { updated_at: new Date() },
							});

							// 3. Mise à jour finale du job avec métriques de performance
							await JobRepository.update(
								jobId,
								{
									status: envelope.event === "job.completed" ? Status.COMPLETED : Status.FAILED,
									ended_at: new Date(),
									generated_tokens: stats?.generated_tokens ?? null,
									time_to_first_token: stats?.time_to_first_token ?? null,
									tokens_per_second: stats?.tokens_per_second ?? null,
									error: envelope.event === "job.failed" ? envelope.data.error : null,
								},
								tx,
							);
						});
						logger.info(`Job ${jobId} finalisé et sauvegardé avec succès en base (message, conversation, job).`);
					}
				} else {
					await JobRepository.update(jobId, {
						status: Status.CANCELLED,
						ended_at: new Date(),
					});
				}

				startedJobs.delete(jobId);
				JobStreamHandler.cleanupJob(jobId);
				return;
			}

			// Synchronisation du statut DB pour les étapes intermédiaires
			await this.syncLifecycle(jobId, envelope);
		} catch (error) {
			logger.error("Erreur lors du traitement de token émis", error);
		}
	}

	// ============================================================================
	/**
	 * Met à jour le statut et les métriques d'un job dans SQLite selon l'événement.
	 */
	// ============================================================================
	private static async syncLifecycle(jobId: string, envelope: JobEventEnvelope): Promise<void> {
		if (terminalJobs.has(jobId)) {
			return;
		}

		if (
			(envelope.event === "job.progress" || envelope.event === "source") &&
			envelope.data.status === "IN_PROGRESS" &&
			!startedJobs.has(jobId)
		) {
			startedJobs.add(jobId);
			const job = await JobRepository.findById(jobId);
			if (job && job.status === Status.PENDING) {
				await JobRepository.update(jobId, {
					status: Status.IN_PROGRESS,
					started_at: new Date(),
				});
			}
		}
	}

	// ============================================================================
	/**
	 * Gère l'expiration d'un job par inactivité du worker (timeout).
	 */
	// ============================================================================
	public static async handleTimeout(payload: any): Promise<void> {
		try {
			const { jobId } = payload;
			logger.warn(`Expiration (timeout) détectée pour le job ${jobId}`);

			const job = await JobRepository.findById(jobId);
			if (job && (job.status === Status.PENDING || job.status === Status.IN_PROGRESS)) {
				terminalJobs.add(jobId);
				startedJobs.delete(jobId);

				await prisma.$transaction(async (tx) => {
					await JobRepository.update(
						jobId,
						{
							status: Status.FAILED,
							ended_at: new Date(),
							error: "Délai d'attente dépassé (inactivité du worker).",
						},
						tx,
					);

					const assistantMsg = await tx.message.findUnique({ where: { id: job.assistant_message_id } });
					const existingContent = assistantMsg?.content || "";
					await tx.message.update({
						where: { id: job.assistant_message_id },
						data: { content: existingContent ? `${existingContent}\n<error>` : "<error>" },
					});
				});

				const failEnvelope: JobEventEnvelope = {
					event: "job.failed",
					data: {
						kind: "state",
						status: "FAILED",
						job_id: job.id,
						conversation_id: job.conversation_id,
						error: "Délai d'attente dépassé (inactivité du worker).",
					},
				};

				eventBus.emit(JobEvents.tokenEmitted, {
					jobId: job.id,
					eventId: "timeout",
					envelope: failEnvelope,
				});

				SseService.closeJobSessions(job.id, "Délai d'attente dépassé");
			}

			startedJobs.delete(jobId);
			JobStreamHandler.cleanupJob(jobId);
		} catch (error) {
			logger.error("Erreur lors de la gestion du timeout", error);
		}
	}

	// ============================================================================
	/**
	 * Libère et enfile les jobs différés dont l'échéance temporelle est atteinte.
	 */
	// ============================================================================
	public static async handleDeferredJobsPoller(): Promise<{ releasedCount: number }> {
		const now = Date.now();
		let releasedCount = 0;
		try {
			const rawJobs = await JobStreamHandler.getDueDeferredJobs(now);
			if (rawJobs.length === 0) return { releasedCount: 0 };

			for (const rawJob of rawJobs) {
				try {
					const payload = JSON.parse(rawJob);
					const { jobId, model, envelope } = payload;

					// Vérification : si le job a été explicitement annulé ou passé en échec, ignorer
					let existingJob: any = null;
					try {
						existingJob = await JobRepository.findById(jobId);
					} catch {}

					if (existingJob && (existingJob.status === Status.CANCELLED || existingJob.status === Status.FAILED)) {
						logger.info(`Job différé ${jobId} ignoré car son statut est [${existingJob.status}].`);
						await redisWriter.zRem(JobStreamKeys.deferred, rawJob);
						continue;
					}

					const updatedEnvelope = {
						...envelope,
						data: { ...envelope.data, status: "PENDING" },
					};

					const appEnv = getAppEnv();
					await JobStreamHandler.releaseDeferredJob(appEnv, model, updatedEnvelope, rawJob);
					JobStreamHandler.trackJob(jobId, appEnv);

					await JobRepository.update(jobId, { status: Status.PENDING });
					logger.info(`Job différé ${jobId} libéré et enfilé dans la file active.`);
					releasedCount++;

					eventBus.emit(JobEvents.createdDone, {
						jobId,
						model,
					});
				} catch (err) {
					logger.error("Erreur lors de la libération d'un job différé:", err);
				}
			}
		} catch (error) {
			logger.error("Erreur lors du poller de jobs différés", error);
		}
		return { releasedCount };
	}

	// ============================================================================
	/**
	 * Vérifie et passe en échec les jobs bloqués sans activité depuis plus de 15 minutes.
	 */
	// ============================================================================
	public static async handleStuckJobsVerifier(): Promise<{ cleanedCount: number }> {
		const limitDate = new Date(Date.now() - 15 * 60 * 1000);
		let cleanedCount = 0;
		try {
			const stuckJobs = await JobRepository.findStuckJobs(limitDate);
			if (stuckJobs.length === 0) return { cleanedCount: 0 };

			logger.warn(`${stuckJobs.length} job(s) bloqué(s) détecté(s) (inactif(s) depuis plus de 15 min).`);

			for (const job of stuckJobs) {
				try {
					await prisma.$transaction(async (tx) => {
						await JobRepository.update(
							job.id,
							{
								status: Status.FAILED,
								ended_at: new Date(),
								error: "Job expiré ou bloqué (plus de 15 minutes d'inactivité).",
							},
							tx,
						);

						await tx.message.update({
							where: { id: job.assistant_message_id },
							data: { content: "Erreur : délai d'attente dépassé (15 minutes d'inactivité)." },
						});
					});

					cleanedCount++;
					logger.info(`Job bloqué ${job.id} marqué comme FAILED.`);
				} catch (err) {
					logger.error(`Impossible de mettre à jour le job bloqué ${job.id}:`, err);
				}
			}
		} catch (error) {
			logger.error("Erreur dans le vérificateur de jobs bloqués", error);
		}
		return { cleanedCount };
	}
}
