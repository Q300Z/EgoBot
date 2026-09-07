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
import { redisStream } from "../../config/redis";
import { JobStreamKeys } from "./job.streams";
import type { JobEventEnvelope } from "./job.schema";

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
		eventBus.on(ConversationEvents.deleted, async ({ conversationId, dev }) => {
			try {
				const activeJobs = await prisma.job.findMany({
					where: { conversation_id: conversationId, status: { in: ["PENDING", "IN_PROGRESS"] } },
					select: { id: true },
				});
				for (const job of activeJobs) {
					await JobStreamHandler.deleteSseStream(dev, job.id);
					await this.cancelJob({ jobId: job.id, dev });
				}
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
		const { jobId, conversationId, userId, userClientId, prompt, logipolConfig, correlationId, executeAt } =
			payload || {};

		if (!jobId || !conversationId || !userId || !prompt || !logipolConfig) {
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
							model: logipolConfig.model as Model,
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
						model: logipolConfig.model as Model,
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

		const eventPayload = {
			event: "job.created" as const,
			data: {
				kind: "state" as const,
				status: executeAt ? ("DEFERRED" as const) : ("PENDING" as const),
				job_id: jobId,
				conversation_id: conversationId,
				dev: logipolConfig.dev,
				data: {
					email: logipolConfig.email,
					url: logipolConfig.url,
					key_db: logipolConfig.db_key,
					prompt,
					history: result.conversation.messages || [],
				},
			},
		};

		const envFlag = logipolConfig.dev === "true" ? "dev" : "prod";

		// Publication dans le stream SSE
		await JobStreamHandler.publishToSseStream(envFlag, result.createdJob.id, eventPayload);

		// Enfilage du job
		if (executeAt) {
			const score = new Date(executeAt).getTime();
			await JobStreamHandler.scheduleDeferred(score, {
				jobId,
				dev: logipolConfig.dev,
				model: logipolConfig.model,
				queueKey: `jobs:queue:${envFlag}:${logipolConfig.model}`,
				envelope: eventPayload,
			});
			logger.info(`Job ${jobId} planifié de manière différée (score: ${score}).`);
		} else {
			await JobStreamHandler.publishToInferenceQueue(envFlag, logipolConfig.model, eventPayload);
			logger.info(`Job ${jobId} enfilé dans la file active.`);
		}

		eventBus.emit(JobEvents.createdDone, {
			jobId: result.createdJob.id,
			conversationId,
			dev: logipolConfig.dev,
			model: logipolConfig.model,
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
		const { jobId, dev, correlationId } = payload || {};
		if (!jobId) return { jobId: "", status: "CANCELLED" };

		logger.info(`Traitement d'annulation pour le job ${jobId}`, { correlationId });

		const job = await JobRepository.findById(jobId);
		if (!job) return { jobId, status: "CANCELLED" };

		if (job.status !== "PENDING" && job.status !== "IN_PROGRESS") {
			return { jobId, status: "CANCELLED" };
		}

		await prisma.$transaction(async (tx) => {
			await JobRepository.update(job.id, { status: "CANCELLED", ended_at: new Date() }, tx);
			await tx.message.update({
				where: { id: job.assistant_message_id },
				data: { content: "<cancelled>" },
			});
		});

		await JobStreamHandler.requestCancellation(job.id);
		logger.info(`Job ${jobId} marqué comme annulé.`, { correlationId });

		return { jobId, status: "CANCELLED" };
	}

	// ============================================================================
	/**
	 * Redirige l'inférence d'un job vers un modèle d'IA alternatif.
	 */
	// ============================================================================
	public static async deferJob(payload: any): Promise<{ success: boolean; newJobId?: string }> {
		const { jobId, targetModel, dev } = payload || {};
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

		const userConfigStr = await AuthRepository.getLogipolConfig(conversation.user_id);
		if (!userConfigStr) return { success: false };

		const newLogipolConfig = {
			...userConfigStr,
			model: targetModel as Model,
			dev: dev ?? userConfigStr.dev ?? "false",
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

		const newDevEnv = newLogipolConfig.dev === "true" ? "dev" : "prod";
		const newEventPayload = {
			event: "job.created" as const,
			data: {
				kind: "state" as const,
				status: "PENDING" as const,
				job_id: newJob.id,
				conversation_id: oldJob.conversation_id,
				dev: newLogipolConfig.dev,
				data: {
					email: newLogipolConfig.email,
					url: newLogipolConfig.url,
					key_db: newLogipolConfig.db_key,
					prompt: (await prisma.message.findUnique({ where: { id: oldJob.user_prompt_id } }))?.content || "",
					history: [],
				},
			},
		};

		await JobStreamHandler.publishToInferenceQueue(newDevEnv, targetModel, newEventPayload);
		JobStreamHandler.trackJob(newJob.id, newDevEnv);

		eventBus.emit(JobEvents.createdDone, {
			jobId: newJob.id,
			conversationId: oldJob.conversation_id,
			dev: newLogipolConfig.dev,
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
					dev: env ?? (envelope.data as any)?.dev ?? "false",
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
						dev: env ?? (envelope.data as any)?.dev,
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
							((envelope.data as any)?.dev === "true" ? "dev" : "prod");
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
			if (job && (job.status === "PENDING" || job.status === "IN_PROGRESS")) {
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
					await tx.message.update({
						where: { id: job.assistant_message_id },
						data: { content: "<error> " + (assistantMsg?.content || "") },
					});
				});

				eventBus.emit(JobEvents.tokenEmitted, {
					jobId: job.id,
					eventId: "timeout",
					envelope: {
						event: "job.failed",
						data: {
							kind: "state",
							status: "FAILED",
							job_id: job.id,
							dev: "false",
							error: "Délai d'attente dépassé (inactivité du worker).",
						},
					},
				});
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
					const { jobId, dev, model, envelope } = payload;

					const updatedEnvelope = {
						...envelope,
						data: { ...envelope.data, status: "PENDING" },
					};

					await JobStreamHandler.releaseDeferredJob(dev === "true" ? "dev" : "prod", model, updatedEnvelope, rawJob);
					JobStreamHandler.trackJob(jobId, dev === "true" ? "dev" : "prod");

					await JobRepository.update(jobId, { status: Status.PENDING });
					logger.info(`Job différé ${jobId} libéré et enfilé dans la file active.`);
					releasedCount++;

					eventBus.emit(JobEvents.createdDone, {
						jobId,
						dev,
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
