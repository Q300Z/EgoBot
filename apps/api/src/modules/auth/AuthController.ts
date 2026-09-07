import type { NextFunction, Request, Response } from "express";
import { ApiResponseFactory } from "../../utils";
import { getValidatedData } from "../../middlewares";
import type { LoginRequest, LoginResponse, RegisterRequest, UserProfile } from "./auth.schema";
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
	 * Authentifie un utilisateur (classique) et renvoie un token JWT.
	 */
	// ============================================================================
	public static async login(req: Request, res: Response, next?: NextFunction): Promise<void> {
		const correlationId = req.correlationId;
		try {
			const { body } = getValidatedData<LoginRequest>(req);

			const result = await AuthService.loginClassic(body);

			logger.info(`Authentification réussie pour l'utilisateur : ${result.user.email}`, { correlationId });

			ApiResponseFactory.success<LoginResponse>(res, result, "Authentification réussie.");
		} catch (error: unknown) {
			logger.error("Échec lors de l'authentification", error, { correlationId });
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
export const register = AuthController.register;
export const getMe = AuthController.getMe;
