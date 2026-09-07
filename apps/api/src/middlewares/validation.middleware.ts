import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ZodError, ZodObject } from "zod";
import { HttpError, ValidationError } from "../core/errors";
import { ApiResponseFactory } from "../utils";
import { LoggerFactory } from "../config/logger";

const logger = LoggerFactory.getLogger("ValidationMiddleware");

/**
 * Extrait récursivement la forme d'un schéma Zod s'il s'agit d'un objet (direct ou enveloppé par ZodEffects).
 */
function getObjectShape(schema: ZodType): Record<string, unknown> | null {
	if (schema instanceof ZodObject) {
		return schema.shape;
	}
	const def = (schema as any)._def;
	if (def?.schema) {
		return getObjectShape(def.schema);
	}
	return null;
}

// ============================================================================
/**
 * Middleware d'interception et de validation des requêtes HTTP avec un schéma Zod.
 */
// ============================================================================
export const validate = (schema: ZodType, safe: boolean = false) => {
	return (req: Request, _res: Response, next: NextFunction): void => {
		try {
			const dataToValidate: Record<string, unknown> = {};
			const shape = getObjectShape(schema);

			if (shape) {
				if ("body" in shape) {
					dataToValidate.body = req.body;
				}
				if ("params" in shape) {
					dataToValidate.params = req.params;
				}
				if ("query" in shape) {
					dataToValidate.query = req.query;
				}
			} else {
				dataToValidate.body = req.body;
				dataToValidate.params = req.params;
				dataToValidate.query = req.query;
			}

			const parseResult = schema.safeParse(dataToValidate);

			if (safe) {
				req.validatedData = parseResult;
				next();
				return;
			}

			if (!parseResult.success) {
				const formattedErrors = parseResult.error.issues.map((err) => ({
					path: err.path.length > 0 ? err.path.join(".") : "root",
					message: err.message,
					code: err.code,
				}));
				throw new ValidationError(formattedErrors);
			}

			req.validatedData = parseResult.data;

			// Mise à jour des données parsées et coercées sur la requête
			if (parseResult.data && typeof parseResult.data === "object") {
				const data = parseResult.data as Record<string, unknown>;
				if ("body" in data && data.body !== undefined) {
					req.body = data.body;
				}
				if ("params" in data && data.params !== undefined) {
					req.params = data.params as any;
				}
				if ("query" in data && data.query !== undefined) {
					req.query = data.query as any;
				}
			}

			next();
		} catch (error) {
			if (error instanceof ZodError) {
				const formattedErrors = error.issues.map((err) => ({
					path: err.path.length > 0 ? err.path.join(".") : "root",
					message: err.message,
					code: err.code,
				}));
				throw new ValidationError(formattedErrors);
			}
			throw error;
		}
	};
};

// ============================================================================
/**
 * Extrait les données typées et validées de la requête Express.
 */
// ============================================================================
export const getValidatedData = <T>(req: Request): T => {
	return (req as Request & { validatedData: T }).validatedData;
};

// ============================================================================
/**
 * Gestionnaire global d'erreurs Express transformant les exceptions en réponses HTTP unifiées.
 */
// ============================================================================
export function globalErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
	if (err instanceof HttpError) {
		if (err.statusCode >= 500) {
			logger.error(`[HttpError ${err.statusCode}] ${err.message}`, err.details || err);
		} else {
			logger.warn(`[HttpError ${err.statusCode}] ${err.message}`);
		}

		if (err instanceof ValidationError || (err.statusCode === 422 && Array.isArray((err as any).issues))) {
			ApiResponseFactory.validationError(res, (err as ValidationError).issues);
			return;
		}

		if (err.statusCode === 401) {
			ApiResponseFactory.unauthorized(res, err.message);
			return;
		}

		if (err.statusCode === 403) {
			ApiResponseFactory.forbidden(res, err.message);
			return;
		}

		if (err.statusCode === 404) {
			ApiResponseFactory.notFound(res, err.message);
			return;
		}

		ApiResponseFactory.badRequest(res, err.message, err.details, err.statusCode);
		return;
	}

	if (err instanceof ZodError) {
		const formattedErrors = err.issues.map((issue) => ({
			path: issue.path.length > 0 ? issue.path.join(".") : "root",
			message: issue.message,
			code: issue.code,
		}));
		logger.warn(`[ZodError 422] Erreur de validation Zod directe interceptée`);
		ApiResponseFactory.validationError(res, formattedErrors);
		return;
	}

	logger.error("Erreur non gérée détectée dans le middleware global Express", err);
	ApiResponseFactory.internalServerError(res, "Erreur serveur", err instanceof Error ? err.message : "Erreur inconnue");
}
