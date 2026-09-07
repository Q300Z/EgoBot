import { ConversationRepository } from "./ConversationRepository";
import { eventBus } from "../../core/bus/eventBus";
import { ConversationCommands } from "./conversation.commands";
import { ConversationEvents } from "./conversation.events";
import { LoggerFactory } from "../../config/logger";
import type { Model } from "@prisma/client";

const logger = LoggerFactory.getLogger("ConversationService");

// ============================================================================
/**
 * Service métier de gestion du cycle de vie des conversations.
 */
// ============================================================================
export class ConversationService {
	private static initialized = false;

	// ============================================================================
	/**
	 * Initialise le service et enregistre ses gestionnaires sur l'EventBus.
	 */
	// ============================================================================
	public static init(): void {
		if (this.initialized) return;
		this.initialized = true;

		eventBus.registerHandler(ConversationCommands.list, async ({ userId, clientId, model }) => {
			const res = await ConversationRepository.findMany(userId, clientId, model);
			return res as any;
		});

		eventBus.registerHandler(ConversationCommands.getById, async ({ id, userId }) => {
			const res = await ConversationRepository.findById(id, userId);
			return res as any;
		});

		eventBus.registerHandler(ConversationCommands.ensureExists, async ({ id, userId, clientId, title, model }) => {
			const res = await ConversationRepository.ensureExists({
				id,
				user_id: userId,
				client_id: clientId,
				title,
				model: model as Model,
			});
			return res as any;
		});

		eventBus.registerHandler(ConversationCommands.deleteLogical, async ({ id, userId, dev }) => {
			const deleted = await ConversationRepository.deleteLogical(id, userId);
			if (!deleted) {
				return { success: false };
			}

			// Émission de l'événement pour que le domaine Job nettoie ses clés Redis et annule ses jobs
			eventBus.emit(ConversationEvents.deleted, {
				conversationId: id,
				userId,
				dev,
			});

			return { success: true };
		});

		eventBus.registerHandler(ConversationCommands.cleanupOld, async () => {
			const cleanedCount = await ConversationRepository.cleanupOld();
			return { cleanedCount };
		});

		logger.info("ConversationService initialisé avec ses handlers.");
	}
}
