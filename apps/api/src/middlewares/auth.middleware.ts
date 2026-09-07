/**
 * Middleware de vérification JWT (JSON Web Token).
 * Il assure la protection des routes sensibles en validant l'identité de l'utilisateur.
 */
import type { NextFunction, Request, Response } from "express";
import { jwtVerify, errors } from "jose";
import { UserPayloadSchema } from "../modules/auth";
import { UnauthorizedError, ForbiddenError } from "../core/errors";
import { traceStorage } from "../config/trace";
import { env } from "../config/env";
import { LoggerFactory } from "../config/logger";

const JWT_SECRET = new TextEncoder().encode(env.SECRET_KEY);

const logger = LoggerFactory.getLogger("AuthMiddleware");

// ============================================================================
/**
 * Middleware d'authentification validant le jeton JWT (Header ou SSE Query).
 */
// ============================================================================
export const authenticateJWT = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const tokenHeader = req.headers["authorization"];
	const acceptHeader = req.headers.accept;

	// Détection des requêtes SSE pour autoriser le token en query param
	const isSseRequest =
		req.method === "GET" && typeof acceptHeader === "string" && acceptHeader.includes("text/event-stream");

	const tokenFromHeader = tokenHeader && tokenHeader.startsWith("Bearer ") ? tokenHeader.split(" ")[1] : undefined;
	const tokenFromQuery = isSseRequest && typeof req.query.token === "string" ? req.query.token : undefined;
	const token = tokenFromHeader ?? tokenFromQuery;

	if (!token) {
		return next(new UnauthorizedError("Jeton d'accès (token) manquant ou mal formé."));
	}

	try {
		// Validation et typage des données du token avec jose
		const { payload } = await jwtVerify(token as string, JWT_SECRET);
		req.user = UserPayloadSchema.parse(payload);

		// Injection des détails de l'utilisateur dans le store de log
		const store = traceStorage.getStore();
		if (store && req.user) {
			store.userId = req.user.id;
			store.email = req.user.email;
		}

		next();
	} catch (error: unknown) {
		if (error instanceof errors.JWTExpired) {
			return next(new UnauthorizedError("Session expirée. Veuillez vous reconnecter."));
		}
		console.error("[AuthMiddleware] Erreur de vérification JWT :", error);
		return next(new UnauthorizedError("Jeton invalide ou expiré."));
	}
};

// ============================================================================
/**
 * Middleware restreignant l'accès aux utilisateurs ayant le rôle ADMIN.
 */
// ============================================================================
export const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
	const user = req.user;
	if (!user) {
		throw new UnauthorizedError("Utilisateur non authentifié.");
	}

	if (user.role !== "ADMIN") {
		throw new ForbiddenError("Accès réservé aux administrateurs.");
	}
	next();
};

// ============================================================================
/**
 * Middleware restreignant l'accès aux requêtes en mode ou compte développement.
 */
// ============================================================================
export const devOnly = (req: Request, res: Response, next: NextFunction): void => {
	const user = req.user;
	if (!user) {
		throw new UnauthorizedError("Utilisateur non authentifié.");
	}

	// Accès autorisé si l'app est en mode dev OU si l'utilisateur possède le flag dev
	if (process.env.NODE_ENV !== "development" && user.dev !== "true") {
		throw new ForbiddenError("Cette fonctionnalité est réservée au mode développement.");
	}
	next();
};

const IP_WHITELIST = new Set([
	"127.0.0.1",
	"::1",
	"213.215.7.75",
	"149.202.77.84",
	"31.32.41.190",
	"92.42.221.158",
	"46.218.29.79",
	"135.125.4.71",
	"5.196.27.20",
	"37.187.143.200",
]);

/**
 * Normalise une adresse IP en supprimant les préfixes IPv6 et en convertissant ::1 en 127.0.0.1.
 */
function normalizeIp(ip: string | undefined): string {
	if (!ip) return "";
	const cleaned = ip.replace(/^::ffff:/, "");
	return cleaned === "::1" ? "127.0.0.1" : cleaned;
}

// ============================================================================
/**
 * Middleware restreignant l'accès aux IP autorisées (liste blanche).
 * Utilise req.ip configuré via trust proxy dans Express.
 */
// ============================================================================
export const authorisedIP = (req: Request, res: Response, next: NextFunction): void => {

	logger.info(`[AuthMiddleware] Vérification de l'IP : ${req.ip} (x-forwarded-for: ${req.headers["x-forwarded-for"]})`);
	logger.info(`[AuthMiddleware] Headers : ${JSON.stringify(req.headers)}`);

	const rawIp =
		(typeof req.headers["x-forwarded-for"] === "string"
			? req.headers["x-forwarded-for"].split(",")[0].trim()
			: undefined) ||
		req.ip ||
		req.socket?.remoteAddress;
	const clientIp = normalizeIp(rawIp);

	if (!IP_WHITELIST.has(clientIp)) {
		throw new ForbiddenError(`Accès interdit depuis l'IP ${clientIp || "inconnue"}.`);
	}
	next();
};
