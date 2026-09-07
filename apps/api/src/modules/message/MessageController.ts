import type { NextFunction, Request, Response } from "express";
import { getValidatedData } from "../../middlewares";
import { ApiResponseFactory } from "../../utils";
import type { CancelMessage, PostMessage } from "./message.schema";
import { BadRequestError, NotFoundError } from "../../core/errors";
import type { UserPayload } from "../auth";
import { LoggerFactory } from "../../config/logger";
import { eventBus } from "../../core/bus/eventBus";
import { MessageCommands } from "./message.commands";
import { AuthCommands } from "../auth/auth.commands";
import { JobCommands } from "../job/job.commands";
import { JobStreamKeys } from "../job/job.streams";
import { redisReader } from "../../config/redis";
import { SseService } from "../../core/sse";

const logger = LoggerFactory.getLogger("MessageController");

// ============================================================================
/**
 * Contrôleur HTTP gérant la publication de messages et le streaming des réponses.
 */
// ============================================================================
export class MessageController {
	// ============================================================================
	/**
	 * Abonne un client au flux SSE temps réel d'un job de génération.
	 */
	// ============================================================================
	public async subscribeJobStream(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			logger.info("Nouvelle demande de souscription SSE reçue", { correlationId });
			const user = req.user as UserPayload | undefined;
			const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;

			if (!jobId) {
				logger.warn("Tentative de souscription sans jobId", { correlationId });
				throw new BadRequestError("jobId manquant");
			}

			// Vérification de l'existence du job via l'EventBus (découplage strict de JobRepository)
			const job = await eventBus.request(JobCommands.getById, { id: jobId });
			if (!job) {
				logger.warn(`Job introuvable pour la souscription : ${jobId}`, { correlationId });
				throw new NotFoundError("Job introuvable");
			}

			// Initialisation de la session SSE
			logger.info(`Initialisation de la session SSE pour le job ${jobId}`, { correlationId, userId: user?.id });
			const session = await SseService.setupJobSession(req, res);

			// Résolution de l'environnement SSE
			let streamEnv: "dev" | "prod" = "prod";
			if (String(user?.dev) === "true") {
				streamEnv = "dev";
			} else if (user?.id) {
				const userConfig = await eventBus.request(AuthCommands.getUserConfig, { userId: user.id });
				if (String(userConfig?.dev) === "true") {
					streamEnv = "dev";
				}
			} else {
				try {
					const envVal = (await redisReader.get(JobStreamKeys.jobEnv(jobId))) as string | null;
					if (envVal === "dev" || envVal === "prod") {
						streamEnv = envVal;
					}
				} catch {
					// fallback to prod
				}
			}

			// Récupération éventuelle de Last-Event-ID
			const lastEventId = (req.headers?.["last-event-id"] || req.query?.lastEventId) as string | undefined;

			// Liaison de la session au flux du job
			await SseService.attachJobSession(jobId, session, streamEnv, lastEventId);
			if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
				logger.info(`Job ${jobId} déjà en état terminal (${job.status}), clôture de la session SSE.`);
				session.destroy();
			}
			logger.info(`Session SSE connectée et synchronisée pour le job ${jobId}`, { correlationId });
		} catch (error: unknown) {
			logger.error("Erreur critique lors de la souscription SSE", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de la souscription SSE");
		}
	}

	// ============================================================================
	/**
	 * Publie un nouveau message utilisateur et enfile le job de traitement.
	 */
	// ============================================================================
	public async postMessage(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			logger.info("Réception d'un nouveau message utilisateur", { correlationId, userId: req.user.id });
			const { body } = getValidatedData<PostMessage>(req);
			const user: UserPayload = req.user;

			const response = await eventBus.request(MessageCommands.post, {
				conversation_id: body.conversation_id,
				prompt: body.prompt,
				execute_at: body.execute_at,
				userId: user.id,
				userEmail: user.email,
				userClientId: user.client_id,
				correlationId,
			});

			ApiResponseFactory.created(res, response, "Job créé avec succès");
		} catch (error: unknown) {
			logger.error("Erreur lors du postMessage", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de l'envoi du message");
		}
	}

	// ============================================================================
	/**
	 * Annule un job de message en cours d'exécution.
	 */
	// ============================================================================
	public async cancelMessage(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			const user: UserPayload = req.user;
			const { params } = getValidatedData<CancelMessage>(req);

			logger.info(`Annulation du job ${params.id} demandée par l'utilisateur`, { correlationId });

			const response = await eventBus.request(MessageCommands.cancel, {
				jobId: params.id,
				dev: user.dev,
				correlationId,
			});

			ApiResponseFactory.success(res, response, "Message annulé avec succès");
		} catch (error: unknown) {
			logger.error("Erreur lors de l'annulation du message", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de l'annulation du message");
		}
	}
}
