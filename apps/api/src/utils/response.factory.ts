/**
 * Fabrique de réponses HTTP standardisées.
 * Elle unifie les formats de succès, d'erreur et de pagination pour faciliter l'intégration frontend.
 */
import { z } from "zod";
import type { Response } from "express";

/**
 * Schémas Zod pour le typage et la validation des réponses API.
 */

// Schéma pour une réponse API succès avec données
export const apiSuccessResponseSchema = z.object({
	message: z.string().optional(),
	data: z.unknown().optional(),
});

// Schéma pour une réponse API erreur
export const apiErrorResponseSchema = z.object({
	error: z.string(),
	details: z.unknown().optional(),
});

export type ApiSuccessResponse = z.infer<typeof apiSuccessResponseSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

// ============================================================================
/**
 * Fabrique standardisée de réponses HTTP pour l'API Express.
 */
// ============================================================================
export const ApiResponseFactory = {
	// ============================================================================
	/**
	 * Formate une réponse HTTP de succès (200 OK par défaut).
	 */
	// ============================================================================
	success<T = unknown>(res: Response, data?: T, message?: string, statusCode = 200): Response {
		const response: ApiSuccessResponse = {
			data,
			...(message && { message }),
		};

		return res.status(statusCode).json(response);
	},

	// ============================================================================
	/**
	 * Formate une réponse 201 Created pour une ressource nouvellement créée.
	 */
	// ============================================================================
	created<T = unknown>(res: Response, data?: T, message?: string): Response {
		return this.success(res, data, message ?? "Ressource créée avec succès.", 201);
	},

	// ============================================================================
	/**
	 * Formate une réponse 202 Accepted pour une requête traitée en asynchrone.
	 */
	// ============================================================================
	accepted<T = unknown>(res: Response, data?: T, message?: string): Response {
		return this.success(res, data, message ?? "Demande acceptée, traitement en cours.", 202);
	},

	// ============================================================================
	/**
	 * Formate une réponse 204 No Content pour une suppression sans contenu.
	 */
	// ============================================================================
	noContent(res: Response): Response {
		return res.status(204).send();
	},

	// ============================================================================
	/**
	 * Formate une réponse 400 Bad Request avec message d'erreur et détails.
	 */
	// ============================================================================
	badRequest(res: Response, error: string, details?: unknown, statusCode = 400): Response {
		const response: ApiErrorResponse = {
			error,
			...(details ? { details } : {}),
		};

		return res.status(statusCode).json(response);
	},

	// ============================================================================
	/**
	 * Formate une réponse 401 Unauthorized lorsque l'identification est requise.
	 */
	// ============================================================================
	unauthorized(res: Response, error?: string): Response {
		return this.badRequest(res, error ?? "Identification requise.", undefined, 401);
	},

	// ============================================================================
	/**
	 * Formate une réponse 403 Forbidden en cas de permissions insuffisantes.
	 */
	// ============================================================================
	forbidden(res: Response, error?: string): Response {
		return this.badRequest(res, error ?? "Vous n'avez pas les permissions nécessaires.", undefined, 403);
	},

	// ============================================================================
	/**
	 * Formate une réponse 404 Not Found lorsqu'une ressource est introuvable.
	 */
	// ============================================================================
	notFound(res: Response, error?: string): Response {
		return this.badRequest(res, error ?? "La ressource demandée est introuvable.", undefined, 404);
	},

	// ============================================================================
	/**
	 * Formate une réponse 409 Conflict en cas de conflit d'état.
	 */
	// ============================================================================
	conflict(res: Response, error: string): Response {
		return this.badRequest(res, error, undefined, 409);
	},

	// ============================================================================
	/**
	 * Formate une réponse 422 Unprocessable Entity pour les erreurs de validation.
	 */
	// ============================================================================
	validationError(
		res: Response,
		errors: Array<{
			path: string;
			message: string;
			code?: string;
		}>,
	): Response {
		return this.badRequest(res, "Erreur de validation des données.", { errors }, 422);
	},

	// ============================================================================
	/**
	 * Formate une réponse 500 Internal Server Error en cas d'incident non géré.
	 */
	// ============================================================================
	internalServerError(res: Response, error: string, details?: unknown): Response {
		const response: ApiErrorResponse = {
			error,
			...(details ? { details } : {}),
		};

		return res.status(500).json(response);
	},

	// ============================================================================
	/**
	 * Formate une réponse de liste avec métadonnées complètes de pagination.
	 */
	// ============================================================================
	paginated<T = unknown>(
		res: Response,
		data: T[],
		pagination: {
			page: number;
			limit: number;
			total: number;
		},
		message?: string,
		statusCode = 200,
	): Response {
		const response = {
			message: message ?? `${data.length} élément(s) trouvé(s).`,
			data,
			pagination: {
				page: pagination.page,
				limit: pagination.limit,
				total: pagination.total,
				pages: Math.ceil(pagination.total / pagination.limit),
			},
		};

		return res.status(statusCode).json(response);
	},

	// ============================================================================
	/**
	 * Intercepte et sérialise une exception en réponse HTTP adaptée.
	 */
	// ============================================================================
	handleError(res: Response, error: unknown, next?: Function, defaultInternalMessage?: string): Response | void {
		if (next) {
			next(error);
			return;
		}

		if (error && typeof error === "object") {
			const err = error as {
				statusCode?: number;
				message?: string;
				details?: unknown;
				issues?: Array<{ path: string; message: string; code?: string }>;
				constructor?: { name?: string };
			};

			if (err.constructor?.name === "ValidationError" || Array.isArray(err.issues)) {
				return this.validationError(
					res,
					err.issues || (err.details as Array<{ path: string; message: string; code?: string }>),
				); // validation issues
			}
			if (err.statusCode === 401) {
				return this.unauthorized(res, err.message);
			}
			if (err.statusCode === 403) {
				return this.forbidden(res, err.message);
			}
			if (err.statusCode === 404) {
				return this.notFound(res, err.message);
			}
			if (err.statusCode === 400) {
				return err.details !== undefined
					? this.badRequest(res, err.message ?? "Requête incorrecte", err.details)
					: this.badRequest(res, err.message ?? "Requête incorrecte");
			}
			if (typeof err.statusCode === "number") {
				return this.badRequest(res, err.message ?? "Requête incorrecte", err.details, err.statusCode);
			}
		}

		if (defaultInternalMessage) {
			return this.internalServerError(res, defaultInternalMessage);
		}

		return this.internalServerError(res, "Erreur interne", error instanceof Error ? error.message : String(error));
	},
};

export default ApiResponseFactory;
