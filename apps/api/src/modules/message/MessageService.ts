import crypto from "node:crypto";
import { eventBus } from "../../core/bus/eventBus";
import { MessageCommands } from "./message.commands";
import { AuthCommands } from "../auth/auth.commands";
import { JobCommands } from "../job/job.commands";
import { UnauthorizedError } from "../../core/errors";
import { LoggerFactory } from "../../config/logger";
import type { MessageResponse } from "./message.schema";

const logger = LoggerFactory.getLogger("MessageService");

// ============================================================================
/**
 * Service métier orchestrant la création et l'annulation des messages.
 */
// ============================================================================
export class MessageService {
	private static initialized = false;

	// ============================================================================
	/**
	 * Initialise le service et enregistre ses gestionnaires de commandes.
	 */
	// ============================================================================
	public static init(): void {
		if (this.initialized) return;
		this.initialized = true;

		eventBus.registerHandler(MessageCommands.post, async (input) => this.handlePostMessage(input));
		eventBus.registerHandler(MessageCommands.cancel, async (input) => this.handleCancelMessage(input));

		logger.info("MessageService initialisé avec ses handlers.");
	}

	// ============================================================================
	/**
	 * Valide la session et délègue la création du job de réponse à l'EventBus.
	 */
	// ============================================================================
	public static async handlePostMessage(input: {
		conversation_id?: string;
		prompt: string;
		execute_at?: string;
		userId: string;
		userEmail: string;
		userClientId: string;
		correlationId?: string;
	}): Promise<MessageResponse> {
		const { conversation_id, prompt, execute_at, userId, userEmail, userClientId, correlationId } = input;

		// 1. Récupération et validation de la configuration Egobot via l'EventBus (découplage Repo Auth)
		const EgobotConfig = await eventBus.request(AuthCommands.getUserConfig, { userId });
		if (!EgobotConfig) {
			logger.warn(`Session Egobot expirée pour l'utilisateur ${userId}`, { correlationId });
			throw new UnauthorizedError("Session Egobot expirée");
		}

		const jobId = crypto.randomUUID();
		const conversationId = conversation_id || crypto.randomUUID();

		// 2. Demande de création et d'enfilement du job via l'EventBus (découplage Repo Job)
		await eventBus.request(JobCommands.create, {
			jobId,
			conversationId,
			userId,
			userEmail,
			userClientId,
			prompt,
			EgobotConfig,
			correlationId,
			executeAt: execute_at,
		});

		logger.info(`Requête de création de job validée pour le job ${jobId}`, { correlationId });

		return {
			job_id: jobId,
			conversation_id: conversationId,
			stream_url: `/sse/v1/job/${jobId}`,
		};
	}

	// ============================================================================
	/**
	 * Transmet une demande d'annulation de job au domaine Job via l'EventBus.
	 */
	// ============================================================================
	public static async handleCancelMessage(input: {
		jobId: string;
		dev: string;
		correlationId?: string;
	}): Promise<{ jobId: string; status: "CANCELLED" }> {
		const { jobId, dev, correlationId } = input;
		logger.info(`Demande d'annulation du message/job ${jobId}`, { correlationId });

		const result = await eventBus.request(JobCommands.cancel, {
			jobId,
			dev,
			correlationId,
		});

		return result;
	}
}
