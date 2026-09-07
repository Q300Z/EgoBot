import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify, errors } from "jose";
import { AuthRepository } from "./AuthRepository";
import type {
	LogipolConfig,
	LoginRequestV1,
	LoginRequestV2,
	LoginResponse,
	ClassicLoginInput,
	RegisterInput,
	UserProfile,
} from "./auth.schema";
import { decodeBlowfish } from "../../utils/crypto";
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

		eventBus.registerHandler(AuthCommands.loginV1, async (input) => this.loginV1(input));
		eventBus.registerHandler(AuthCommands.loginV2, async (input) => this.loginV2(input));
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
	 * Traite la connexion utilisateur en version 1 et génère son token JWT.
	 */
	// ============================================================================
	public static async loginV1(body: LoginRequestV1["body"]): Promise<LoginResponse> {
		// Sauvegarde de la configuration Logipol dans Redis
		await AuthRepository.saveLogipolConfig(body.user, body);

		const payload = {
			id: body.user,
			email: body.email,
			client_id: body.client,
			role: body.email.toLowerCase().endsWith("@agelid.com") && body.dev === "true" ? "ADMIN" : "USER",
			dev: body.dev ?? "false",
		};

		// Génération du JWT avec jose
		const token = await new SignJWT(payload)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(JWT_SECRET);

		logger.info(`Session Logipol initialisée (V1) pour l'utilisateur : ${body.email}`);

		eventBus.emit(AuthEvents.userLoggedIn, {
			userId: body.user,
			email: body.email,
			version: "v1",
			dev: body.dev ?? "false",
		});

		return {
			token,
			user: {
				email: body.email,
				dev: body.dev ?? "false",
			},
		};
	}

	// ============================================================================
	/**
	 * Traite la connexion chiffrée Blowfish en version 2 et génère son token JWT.
	 */
	// ============================================================================
	public static async loginV2(body: LoginRequestV2["body"]): Promise<LoginResponse> {
		// Déchiffrement des données Blowfish
		const dechiffreData = decodeBlowfish("IA@gelid2026", "", body.data);
		const data = Object.fromEntries(
			dechiffreData.split("|").map((pair) => {
				const index = pair.indexOf("=");
				return [pair.substring(0, index), decodeURIComponent(pair.substring(index + 1))];
			}),
		);

		if (!data.email || !data.client || !data.db_key || !data.dev) {
			throw new Error("Payload Blowfish invalide ou champs requis manquants.");
		}

		const config: LogipolConfig = {
			url: body.url,
			model: body.model,
			email: data.email,
			user: data.user,
			client: data.client,
			db_key: data.db_key,
			dev: data.dev,
		};

		const user: LogipolConfig | null = await AuthRepository.getLogipolConfig(config.user);
		let token = user?.token;

		const payload = {
			id: config.user,
			email: config.email,
			client_id: config.client,
			role: config.email.toLowerCase().endsWith("@agelid.com") && config.dev === "true" ? "ADMIN" : "USER",
			dev: config.dev ?? "false",
		};

		if (!user || !token) {
			token = await new SignJWT(payload)
				.setProtectedHeader({ alg: "HS256" })
				.setIssuedAt()
				.setExpirationTime("1h")
				.sign(JWT_SECRET);
			await AuthRepository.saveLogipolConfig(config.user, { ...config, token });
		} else {
			try {
				const { payload: jwtPayload } = await jwtVerify(token, JWT_SECRET);

				if (
					jwtPayload.id !== payload.id ||
					jwtPayload.email !== payload.email ||
					jwtPayload.client_id !== payload.client_id ||
					jwtPayload.role !== payload.role ||
					jwtPayload.dev !== payload.dev
				) {
					throw new Error("JWT invalide : les informations du payload ne correspondent pas.");
				}
			} catch (err) {
				if (err instanceof errors.JWTExpired) {
					logger.info(`JWT expiré pour l'utilisateur : ${config.email}. Génération d'un nouveau token.`);
					token = await new SignJWT(payload)
						.setProtectedHeader({ alg: "HS256" })
						.setIssuedAt()
						.setExpirationTime("1h")
						.sign(JWT_SECRET);
				} else {
					throw err;
				}
			}

			await AuthRepository.saveLogipolConfig(config.user, { ...config, token });
		}

		logger.info(`Session Logipol initialisée (V2) pour l'utilisateur : ${config.email}`);

		eventBus.emit(AuthEvents.userLoggedIn, {
			userId: config.user,
			email: config.email,
			version: "v2",
			dev: config.dev ?? "false",
		});

		return {
			token: token || "",
			user: {
				email: config.email,
				dev: config.dev ?? "false",
			},
		};
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
		const role = data.role || (data.email.toLowerCase().endsWith("@agelid.com") ? "ADMIN" : "USER");

		const user = await AuthRepository.createUser({
			email: data.email,
			username: data.username || null,
			password_hash,
			role,
		});

		const dev = role === "ADMIN" || data.email.toLowerCase().endsWith("@agelid.com") ? "true" : "false";
		const payload = {
			id: user.id,
			email: user.email,
			role: user.role,
			dev,
			client_id: "default",
		};

		const token = await new SignJWT(payload)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("24h")
			.sign(JWT_SECRET);

		logger.info(`Nouvel utilisateur inscrit : ${user.email} (id: ${user.id})`);

		eventBus.emit(AuthEvents.userLoggedIn, {
			userId: user.id,
			email: user.email,
			version: "classic",
			dev,
		});

		return {
			token,
			user: {
				id: user.id,
				email: user.email,
				username: user.username,
				role: user.role,
				dev,
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

		const dev = user.role === "ADMIN" || user.email.toLowerCase().endsWith("@agelid.com") ? "true" : "false";
		const payload = {
			id: user.id,
			email: user.email,
			role: user.role,
			dev,
			client_id: "default",
		};

		const token = await new SignJWT(payload)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("24h")
			.sign(JWT_SECRET);

		logger.info(`Utilisateur connecté (classique) : ${user.email} (id: ${user.id})`);

		eventBus.emit(AuthEvents.userLoggedIn, {
			userId: user.id,
			email: user.email,
			version: "classic",
			dev,
		});

		return {
			token,
			user: {
				id: user.id,
				email: user.email,
				username: user.username,
				role: user.role,
				dev,
			},
		};
	}

	// ============================================================================
	/**
	 * Point d'entrée de login polymorphe (supporte login classique et logipol V1).
	 */
	// ============================================================================
	public static async login(body: any): Promise<LoginResponse> {
		if (body && typeof body === "object" && "password" in body) {
			return this.loginClassic(body);
		}
		return this.loginV1(body);
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

		const logipol = await AuthRepository.getLogipolConfig(userId);
		if (logipol) {
			return {
				id: logipol.user,
				email: logipol.email,
				username: logipol.user,
				role: logipol.email.toLowerCase().endsWith("@agelid.com") && logipol.dev === "true" ? "ADMIN" : "USER",
			};
		}

		throw new NotFoundError("Utilisateur introuvable.");
	}

	// ============================================================================
	/**
	 * Récupère la configuration utilisateur stockée en cache Redis.
	 */
	// ============================================================================
	public static async getUserConfig(userId: string): Promise<LogipolConfig | null> {
		return AuthRepository.getLogipolConfig(userId);
	}

	// ============================================================================
	/**
	 * Enregistre ou met à jour la configuration d'un utilisateur dans Redis.
	 */
	// ============================================================================
	public static async saveUserConfig(userId: string, config: LogipolConfig): Promise<void> {
		return AuthRepository.saveLogipolConfig(userId, config);
	}

	// ============================================================================
	/**
	 * Supprime la configuration et la session d'un utilisateur dans Redis.
	 */
	// ============================================================================
	public static async deleteUserConfig(userId: string): Promise<void> {
		return AuthRepository.deleteLogipolConfig(userId);
	}
}
