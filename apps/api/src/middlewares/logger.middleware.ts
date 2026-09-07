import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { logger as pinoLogger } from "../config/logger";
import { traceStorage } from "../config/trace";

export const CORRELATION_ID_HEADER = "X-Correlation-Id";

// ============================================================================
/**
 * Middleware de journalisation structurée et d'injection du contexte de corrélation de trace.
 */
// ============================================================================
export const loggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
	const startTime = performance.now();
	const correlationId = (req.header(CORRELATION_ID_HEADER) || randomUUID()) as string;

	req.correlationId = correlationId;
	res.setHeader(CORRELATION_ID_HEADER, correlationId);

	// Initialisation du contexte AsyncLocalStorage et exécution de la requête
	traceStorage.run({ correlationId }, () => {
		const { method, originalUrl } = req;

		res.on("finish", () => {
			const duration = performance.now() - startTime;
			const { statusCode } = res;
			const user = req.user ? req.user.email : "Anonyme";

			pinoLogger.info(
				{
					durationMs: duration,
					method,
					url: originalUrl,
					statusCode,
					user,
					correlationId,
				},
				`${method} ${originalUrl} - ${statusCode} - ${user} (${duration.toFixed(2)}ms)`,
			);
		});

		next();
	});
};

export const logger = loggerMiddleware;
export const traceMiddleware = loggerMiddleware;
