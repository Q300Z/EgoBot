import { redisReader, redisWriter } from "../../config/redis";
import { LogipolConfigSchema, type LogipolConfig } from "./auth.schema";
import { LoggerFactory } from "../../config/logger";

const logger = LoggerFactory.getLogger("AuthRepository");

import { prisma } from "../../config/db";

export interface UserModel {
	id: string;
	email: string;
	username: string | null;
	password_hash: string;
	role: string;
	created_at: Date;
	updated_at: Date;
}

// ============================================================================
/**
 * Référentiel d'accès aux sessions, configurations Logipol dans Redis et utilisateurs dans SQLite.
 */
// ============================================================================
export class AuthRepository {
	// ============================================================================
	/**
	 * Recherche un utilisateur par son identifiant unique (id).
	 */
	// ============================================================================
	public static async findUserById(id: string): Promise<UserModel | null> {
		return (prisma as any).user.findUnique({
			where: { id },
		});
	}

	// ============================================================================
	/**
	 * Recherche un utilisateur par son adresse email.
	 */
	// ============================================================================
	public static async findUserByEmail(email: string): Promise<UserModel | null> {
		return (prisma as any).user.findUnique({
			where: { email },
		});
	}

	// ============================================================================
	/**
	 * Recherche un utilisateur par son nom d'utilisateur.
	 */
	// ============================================================================
	public static async findUserByUsername(username: string): Promise<UserModel | null> {
		return (prisma as any).user.findUnique({
			where: { username },
		});
	}

	// ============================================================================
	/**
	 * Recherche un utilisateur par son identifiant de connexion (email ou nom d'utilisateur).
	 */
	// ============================================================================
	public static async findUserByIdentifier(identifier: string): Promise<UserModel | null> {
		return (prisma as any).user.findFirst({
			where: {
				OR: [{ email: identifier }, { username: identifier }],
			},
		});
	}

	// ============================================================================
	/**
	 * Crée un nouvel utilisateur dans la base de données.
	 */
	// ============================================================================
	public static async createUser(data: {
		email: string;
		password_hash: string;
		username?: string | null;
		role?: string;
	}): Promise<UserModel> {
		return (prisma as any).user.create({
			data: {
				email: data.email,
				password_hash: data.password_hash,
				username: data.username ?? null,
				role: data.role ?? "USER",
			},
		});
	}

	// ============================================================================
	/**
	 * Récupère la configuration d'un utilisateur stockée dans Redis.
	 */
	// ============================================================================
	public static async getLogipolConfig(userId: string): Promise<LogipolConfig | null> {
		try {
			const rawConfig = await redisReader.get(`logipol:${userId}`);
			if (!rawConfig) return null;

			const configStr = typeof rawConfig === "string" ? rawConfig : String(rawConfig);

			const parsed = LogipolConfigSchema.safeParse(JSON.parse(configStr));
			if (!parsed.success) {
				logger.error(`Structure de configuration Logipol invalide dans Redis pour ${userId}`);
				return null;
			}
			return parsed.data;
		} catch (error) {
			logger.error(`Erreur lors de la récupération de la configuration Logipol pour ${userId}`, error);
			return null;
		}
	}

	// ============================================================================
	/**
	 * Sauvegarde la configuration Logipol dans Redis avec une expiration d'une heure.
	 */
	// ============================================================================
	public static async saveLogipolConfig(userId: string, config: LogipolConfig): Promise<void> {
		await redisWriter.set(`logipol:${userId}`, JSON.stringify(config), { EX: 3600 });
	}

	// ============================================================================
	/**
	 * Vérifie la présence de la configuration Logipol dans Redis.
	 */
	// ============================================================================
	public static async existsLogipolConfig(userId: string): Promise<boolean> {
		const exists = await redisReader.exists(`logipol:${userId}`);
		return Number(exists) > 0;
	}

	// ============================================================================
	/**
	 * Supprime la configuration Logipol de l'utilisateur dans Redis.
	 */
	// ============================================================================
	public static async deleteLogipolConfig(userId: string): Promise<void> {
		await redisWriter.del(`logipol:${userId}`);
	}
}
