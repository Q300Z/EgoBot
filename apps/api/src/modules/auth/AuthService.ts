import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT } from "jose";
import { AuthRepository } from "./AuthRepository";
import type {
	EgobotConfig,
	LoginResponse,
	ClassicLoginInput,
	RegisterInput,
	UserProfile,
} from "./auth.schema";
import { env } from "../../config/env";
import { LoggerFactory } from "../../config/logger";
import { eventBus } from "../../core/bus/eventBus";
import { AuthCommands } from "./auth.commands";
import { AuthEvents } from "./auth.events";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../../core/errors";

const logger = LoggerFactory.getLogger("AuthService");
const JWT_SECRET = new TextEncoder().encode(env.SECRET_KEY);
const scryptAsync = promisify(scrypt);

export class PasswordService {
	public static async hash(password: string): Promise<string> {
		const salt = randomBytes(16).toString("hex");
		const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
		return `${salt}:${derivedKey.toString("hex")}`;
	}

	public static async verify(password: string, hash: string): Promise<boolean> {
		try {
			const [salt, key] = hash.split(":");
			if (!salt || !key) return false;
			const keyBuffer = Buffer.from(key, "hex");
			const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
			if (keyBuffer.length !== derivedKey.length) {
				return false;
			}
			return timingSafeEqual(keyBuffer, derivedKey);
		} catch {
			return false;
		}
	}
}

// ============================================================================
/**
 * Service métier responsable de l'authentification et de la gestion des tokens.
 */
// ============================================================================
export class AuthService {
	private static initialized = false;

	// ============================================================================
	/**
	 * Initialise le service et enregistre ses gestionnaires de commandes.
	 */
	// ============================================================================
	public static init(): void {
		if (this.initialized) return;
		this.initialized = true;

		eventBus.registerHandler(AuthCommands.loginClassic, async (input) => this.loginClassic(input));
		eventBus.registerHandler(AuthCommands.register, async (input) => this.register(input));
		eventBus.registerHandler(AuthCommands.getMe, async ({ userId }) => this.getMe(userId));
		eventBus.registerHandler(AuthCommands.getUserConfig, async ({ userId }) => this.getUserConfig(userId));
		eventBus.registerHandler(AuthCommands.saveUserConfig, async ({ userId, config }) => {
			await this.saveUserConfig(userId, config);
			return { success: true };
		});
		eventBus.registerHandler(AuthCommands.deleteUserConfig, async ({ userId }) => {
			await this.deleteUserConfig(userId);
			return { success: true };
		});

		logger.info("AuthService initialisé avec ses handlers de commandes.");
	}

	// ============================================================================
	/**
	 * Inscription d'un nouvel utilisateur (auth classique).
	 */
	// ============================================================================
	public static async register(data: RegisterInput): Promise<LoginResponse> {
		const existingUser = await AuthRepository.findUserByEmail(data.email);
		if (existingUser) {
			throw new BadRequestError("Un utilisateur avec cette adresse email existe déjà.");
		}

		if (data.username) {
			const existingUsername = await AuthRepository.findUserByUsername(data.username);
			if (existingUsername) {
				throw new BadRequestError("Ce nom d'utilisateur est déjà pris.");
			}
		}

		const password_hash = await PasswordService.hash(data.password);
		// Sécurité : l'inscription publique attribue strictement le rôle USER (ou ADMIN si domaine interne Agelid)
		const role = data.email.toLowerCase().endsWith("@agelid.com") ? "ADMIN" : "USER";

		const user = await AuthRepository.createUser({
			email: data.email,
			username: data.username || null,
			password_hash,
			role,
		});

		const payload = {
			id: user.id,
			email: user.email,
			role: user.role,
		};

		const token = await new SignJWT(payload)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("24h")
			.sign(JWT_SECRET);

		logger.info(`Nouvel utilisateur inscrit : ${user.email} (id: ${user.id})`);

		const defaultConfig: EgobotConfig = {
			url: "http://localhost:8000",
			model: "CHATBOT",
			email: user.email,
			user: user.id,
			token,
		};
		try {
			await AuthRepository.saveEgobotConfig(user.id, defaultConfig);
		} catch (error) {
			logger.warn(`Impossible de sauvegarder la configuration initiale pour ${user.id}:`, error);
		}

		eventBus.emit(AuthEvents.userLoggedIn, {
			userId: user.id,
			email: user.email,
			version: "classic",
		});

		return {
			token,
			user: {
				id: user.id,
				email: user.email,
				username: user.username,
				role: user.role,
			},
		};
	}

	// ============================================================================
	/**
	 * Connexion classique avec identifiant (email ou nom d'utilisateur) et mot de passe.
	 */
	// ============================================================================
	public static async loginClassic(input: ClassicLoginInput): Promise<LoginResponse> {
		const identifier = (input.emailOrUsername || input.email || input.username)?.trim();
		if (!identifier) {
			throw new BadRequestError("L'identifiant (email ou nom d'utilisateur) est requis.");
		}

		const user = await AuthRepository.findUserByIdentifier(identifier);
		if (!user) {
			throw new UnauthorizedError("Identifiants incorrects.");
		}

		const passwordMatch = await PasswordService.verify(input.password, user.password_hash);
		if (!passwordMatch) {
			throw new UnauthorizedError("Identifiants incorrects.");
		}

		const payload = {
			id: user.id,
			email: user.email,
			role: user.role,
			client_id: "default",
		};

		const token = await new SignJWT(payload)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("24h")
			.sign(JWT_SECRET);

		logger.info(`Utilisateur connecté (classique) : ${user.email} (id: ${user.id})`);

		const defaultConfig: EgobotConfig = {
			url: "http://localhost:8000",
			model: "CHATBOT",
			email: user.email,
			user: user.id,
			token,
		};
		try {
			await AuthRepository.saveEgobotConfig(user.id, defaultConfig);
		} catch (error) {
			logger.warn(`Impossible de mettre à jour la configuration session pour ${user.id}:`, error);
		}

		eventBus.emit(AuthEvents.userLoggedIn, {
			userId: user.id,
			email: user.email,
			version: "classic",
		});

		return {
			token,
			user: {
				id: user.id,
				email: user.email,
				username: user.username,
				role: user.role,
			},
		};
	}

	// ============================================================================
	/**
	 * Récupère le profil de l'utilisateur authentifié (sans hash de mot de passe).
	 */
	// ============================================================================
	public static async getMe(userId: string): Promise<UserProfile> {
		const user = await AuthRepository.findUserById(userId);
		if (user) {
			return {
				id: user.id,
				email: user.email,
				username: user.username,
				role: user.role,
				created_at: user.created_at,
				updated_at: user.updated_at,
			};
		}

		const Egobot = await AuthRepository.getEgobotConfig(userId);
		if (Egobot) {
			return {
				id: Egobot.user,
				email: Egobot.email,
				username: Egobot.user,
				role: Egobot.email.toLowerCase().endsWith("@agelid.com") ? "ADMIN" : "USER",
			};
		}

		throw new NotFoundError("Utilisateur introuvable.");
	}

	// ============================================================================
	/**
	 * Récupère la configuration utilisateur stockée en cache Redis.
	 */
	// ============================================================================
	public static async getUserConfig(userId: string): Promise<EgobotConfig | null> {
		const cached = await AuthRepository.getEgobotConfig(userId);
		if (cached) return cached;

		// Fallback pour utilisateur classique inscrit en base SQLite
		const user = await AuthRepository.findUserById(userId);
		if (user) {
			const defaultConfig: EgobotConfig = {
				url: "http://localhost:8000",
				model: "CHATBOT",
				email: user.email,
				user: user.id,
			};
			try {
				await AuthRepository.saveEgobotConfig(user.id, defaultConfig);
			} catch {}
			return defaultConfig;
		}

		return null;
	}

	// ============================================================================
	/**
	 * Enregistre ou met à jour la configuration d'un utilisateur dans Redis.
	 */
	// ============================================================================
	public static async saveUserConfig(userId: string, config: EgobotConfig): Promise<void> {
		return AuthRepository.saveEgobotConfig(userId, config);
	}

	// ============================================================================
	/**
	 * Supprime la configuration et la session d'un utilisateur dans Redis.
	 */
	// ============================================================================
	public static async deleteUserConfig(userId: string): Promise<void> {
		return AuthRepository.deleteEgobotConfig(userId);
	}
}
