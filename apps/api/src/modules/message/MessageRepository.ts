import { prisma } from "../../config/db";
import type { Role, Prisma, PrismaClient } from "@prisma/client";

// ============================================================================
/**
 * Référentiel d'accès aux données des messages dans SQLite / Prisma.
 */
// ============================================================================
export class MessageRepository {
	// ============================================================================
	/**
	 * Crée et persiste un message utilisateur ou assistant dans la base SQLite.
	 */
	// ============================================================================
	public static async create(
		conversationId: string,
		role: "USER" | "ASSISTANT",
		content: string,
		id?: string,
		tx: Prisma.TransactionClient | PrismaClient = prisma,
	) {
		return tx.message.create({
			data: {
				id: id || undefined,
				conversation_id: conversationId,
				role: role as Role,
				content,
			},
		});
	}

	// ============================================================================
	/**
	 * Met à jour le contenu textuel d'un message existant.
	 */
	// ============================================================================
	public static async updateContent(
		messageId: string,
		content: string,
		tx: Prisma.TransactionClient | PrismaClient = prisma,
	) {
		return tx.message.update({
			where: { id: messageId },
			data: { content },
		});
	}

	// ============================================================================
	/**
	 * Récupère un message par son identifiant unique.
	 */
	// ============================================================================
	public static async findById(id: string) {
		return prisma.message.findUnique({
			where: { id },
		});
	}
}
