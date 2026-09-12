import { redisReader, redisWriter } from "../../config/redis";
import { EgobotConfigSchema, type EgobotConfig } from "./auth.schema";
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
 * Référentiel d'accès aux sessions, configurations Egobot dans Redis et utilisateurs dans SQLite.
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
	public static async getEgobotConfig(userId: string): Promise<EgobotConfig | null> {
		try {
			const rawConfig = await redisReader.get(`Egobot:${userId}`);
			if (!rawConfig) return null;

			const configStr = typeof rawConfig === "string" ? rawConfig : String(rawConfig);

			const parsed = EgobotConfigSchema.safeParse(JSON.parse(configStr));
			if (!parsed.success) {
				logger.error(`Structure de configuration Egobot invalide dans Redis pour ${userId}`);
				return null;
			}
			return parsed.data;
		} catch (error) {
			logger.error(`Erreur lors de la récupération de la configuration Egobot pour ${userId}`, error);
			return null;
		}
	}

	// ============================================================================
	/**
	 * Sauvegarde la configuration Egobot dans Redis avec une expiration d'une heure.
	 */
	// ============================================================================
	public static async saveEgobotConfig(userId: string, config: EgobotConfig): Promise<void> {
		await redisWriter.set(`Egobot:${userId}`, JSON.stringify(config), { EX: 3600 });
	}

	// ============================================================================
	/**
	 * Vérifie la présence de la configuration Egobot dans Redis.
	 */
	// ============================================================================
	public static async existsEgobotConfig(userId: string): Promise<boolean> {
		const exists = await redisReader.exists(`Egobot:${userId}`);
		return Number(exists) > 0;
	}

	// ============================================================================
	/**
	 * Supprime la configuration Egobot de l'utilisateur dans Redis.
	 */
	// ============================================================================
	public static async deleteEgobotConfig(userId: string): Promise<void> {
		await redisWriter.del(`Egobot:${userId}`);
	}
}
