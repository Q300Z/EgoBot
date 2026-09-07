import type { NextFunction, Request, Response } from "express";
import { ApiResponseFactory } from "../../utils";
import { getValidatedData } from "../../middlewares";
import type {
	LoginRequest,
	LoginRequestV1,
	LoginRequestV2,
	LoginResponse,
	RegisterRequest,
	UserProfile,
} from "./auth.schema";
import { LoggerFactory } from "../../config/logger";
import { AuthService } from "./AuthService";
import { UnauthorizedError } from "../../core/errors";

const logger = LoggerFactory.getLogger("AuthController");

// ============================================================================
/**
 * Contrôleur HTTP gérant l'authentification et l'initialisation des sessions.
 */
// ============================================================================
export class AuthController {
	// ============================================================================
	/**
	 * Authentifie un utilisateur (classique ou Logipol V1) et renvoie un token JWT.
	 */
	// ============================================================================
	public static async login(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			const { body } = getValidatedData<LoginRequest>(req);

			const isClassic = body && typeof body === "object" && "password" in body;
			const result = await AuthService.login(body);

			if (isClassic) {
				logger.info(`Authentification réussie pour l'utilisateur : ${result.user.email}`, { correlationId });
			} else {
				logger.info(`Session Logipol initialisée (V1) pour l'utilisateur : ${result.user.email}`, { correlationId });
			}

			ApiResponseFactory.success<LoginResponse>(res, result, "Authentification réussie.");
		} catch (error: unknown) {
			logger.error("Échec lors de l'authentification", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de la connexion au service.");
		}
	}

	// ============================================================================
	/**
	 * Authentifie un utilisateur en V1 et initialise sa session Logipol (compatibilité).
	 */
	// ============================================================================
	public static async loginV1(req: Request, res: Response, next?: NextFunction): Promise<void> {
		return AuthController.login(req, res, next);
	}

	// ============================================================================
	/**
	 * Authentifie un utilisateur en V2 (Blowfish) et initialise sa session Logipol.
	 */
	// ============================================================================
	public static async loginV2(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			const { body } = getValidatedData<LoginRequestV2>(req);

			const result = await AuthService.loginV2(body);

			logger.info(`Session Logipol initialisée (V2) pour l'utilisateur : ${body.url}`, { correlationId });

			ApiResponseFactory.success<LoginResponse>(res, result, "Authentification réussie.");
		} catch (error: unknown) {
			logger.error("Échec critique lors de l'authentification V2", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de la connexion au service.");
		}
	}

	// ============================================================================
	/**
	 * Inscription d'un nouvel utilisateur classique.
	 */
	// ============================================================================
	public static async register(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			const { body } = getValidatedData<RegisterRequest>(req);

			const result = await AuthService.register(body);

			logger.info(`Compte utilisateur créé : ${result.user.email}`, { correlationId });

			ApiResponseFactory.created<LoginResponse>(res, result, "Compte créé avec succès.");
		} catch (error: unknown) {
			logger.error("Échec lors de l'inscription", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de l'inscription.");
		}
	}

	// ============================================================================
	/**
	 * Récupère le profil de l'utilisateur connecté (requête authentifiée).
	 */
	// ============================================================================
	public static async getMe(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			const userId = req.user?.id;
			if (!userId) {
				throw new UnauthorizedError("Utilisateur non authentifié.");
			}

			const result = await AuthService.getMe(userId);

			ApiResponseFactory.success<UserProfile>(res, result, "Profil récupéré avec succès.");
		} catch (error: unknown) {
			logger.error("Échec lors de la récupération du profil", error, { correlationId });
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de la récupération du profil.");
		}
	}
}

// Alias pour compatibilité des imports de test
export const login = AuthController.login;
export const loginV1 = AuthController.loginV1;
export const loginV2 = AuthController.loginV2;
export const register = AuthController.register;
export const getMe = AuthController.getMe;

