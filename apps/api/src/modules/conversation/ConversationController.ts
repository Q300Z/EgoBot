import type { NextFunction, Request, Response } from "express";
import { ApiResponseFactory } from "../../utils";
import type { GetConversation, GetConversationsQuery } from "./conversation.schema";
import { NotFoundError, BadRequestError } from "../../core/errors";
import { getValidatedData } from "../../middlewares";
import { eventBus } from "../../core/bus/eventBus";
import { AuthCommands } from "../auth/auth.commands";
import { ConversationCommands } from "./conversation.commands";
import { LoggerFactory } from "../../config/logger";

const logger = LoggerFactory.getLogger("ConversationController");

// ============================================================================
/**
 * Contrôleur HTTP gérant les conversations des utilisateurs.
 */
// ============================================================================
export class ConversationController {
	// ============================================================================
	/**
	 * Récupère la liste des conversations de l'utilisateur connecté.
	 */
	// ============================================================================
	public async getConversations(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			const user = req.user;
			const validated = getValidatedData<GetConversationsQuery>(req);
			const query = (validated?.query ?? req.query ?? {}) as Record<string, unknown>;
			const page =
				query.page !== undefined
					? Number(query.page)
					: query.offset !== undefined && query.limit !== undefined
						? Math.floor(Number(query.offset) / Number(query.limit)) + 1
						: undefined;
			const pageSize =
				query.pageSize !== undefined
					? Number(query.pageSize)
					: query.limit !== undefined
						? Number(query.limit)
						: undefined;
			const search = typeof query.search === "string" && query.search.trim().length > 0 ? query.search.trim() : undefined;

			logger.info(`Récupération des listes pour l'utilisateur ${user.email}`, { correlationId, userId: user.id });

			const config = await eventBus.request(AuthCommands.getUserConfig, { userId: user.id });
			if (!config) {
				throw new BadRequestError("Configuration client (Egobot) manquante ou expirée.");
			}

			const result = await eventBus.request(ConversationCommands.list, {
				userId: user.id,
				clientId: user.client_id,
				model: config.model,
				page,
				pageSize,
				search,
			});

			if (result && !Array.isArray(result) && "items" in result) {
				logger.info(`${result.items.length}/${result.total} conversation(s) trouvée(s).`, { correlationId, userId: user.id });
				ApiResponseFactory.paginated(res, result.items, {
					page: result.page,
					limit: result.pageSize,
					total: result.total,
				});
				return;
			}

			const conversations = Array.isArray(result) ? result : [];
			logger.info(`${conversations.length} conversation(s) trouvée(s).`, { correlationId, userId: user.id });
			ApiResponseFactory.success(res, conversations);
		} catch (error: unknown) {
			logger.error("Échec de getConversations", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de la récupération de la liste.");
		}
	}

	// ============================================================================
	/**
	 * Récupère le détail et les messages d'une conversation par son identifiant.
	 */
	// ============================================================================
	public async getConversation(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			const { params } = getValidatedData<GetConversation>(req);
			const user = req.user;

			logger.info(`Lecture de la discussion : ${params.id}`, { correlationId, userId: user.id });

			const conversation = await eventBus.request(ConversationCommands.getById, {
				id: params.id,
				userId: user.id,
			});

			if (!conversation) {
				throw new NotFoundError("La discussion demandée est introuvable.");
			}

			ApiResponseFactory.success(res, conversation);
		} catch (error: unknown) {
			logger.error("Échec de getConversation", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de la lecture de la discussion.");
		}
	}

	// ============================================================================
	/**
	 * Déclenche la suppression asynchrone d'une conversation et de ses données.
	 */
	// ============================================================================
	public async deleteConversation(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			const { params } = getValidatedData<GetConversation>(req);
			const user = req.user;

			logger.info(`Planification de la suppression pour : ${params.id}`, { correlationId, userId: user.id });

			// 1. Libère le client immédiatement (202 Accepted)
			ApiResponseFactory.accepted(
				res,
				{ conversationId: params.id, status: "DELETION_SCHEDULED" },
				"Suppression en cours de traitement.",
			);

			// 2. Nettoyage asynchrone via la commande EventBus
			void eventBus
				.request(ConversationCommands.deleteLogical, {
					id: params.id,
					userId: user.id,
				})
				.catch((error) => {
					logger.error("Erreur en arrière-plan lors de la suppression", error, { correlationId });
				});
		} catch (error: unknown) {
			logger.error("Échec de deleteConversation", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next);
		}
	}
}
