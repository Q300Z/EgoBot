import { prisma } from "../../config/db";
import { Status, Model, Prisma, PrismaClient } from "@prisma/client";

// ============================================================================
/**
 * Référentiel d'accès aux données des jobs dans SQLite / Prisma.
 */
// ============================================================================
export class JobRepository {
	// ============================================================================
	/**
	 * Enregistre un nouveau job d'inférence en base de données.
	 */
	// ============================================================================
	public static async create(
		data: {
			id: string;
			conversation_id: string;
			user_prompt_id: string;
			assistant_message_id: string;
			model: Model;
			status?: Status;
		},
		tx: Prisma.TransactionClient | PrismaClient = prisma,
	) {
		return tx.job.create({
			data: {
				id: data.id,
				conversation_id: data.conversation_id,
				user_prompt_id: data.user_prompt_id,
				assistant_message_id: data.assistant_message_id,
				model: data.model,
				status: data.status || "PENDING",
			},
		});
	}

	// ============================================================================
	/**
	 * Récupère un job par son identifiant unique.
	 */
	// ============================================================================
	public static async findById(id: string) {
		return prisma.job.findUnique({
			where: { id },
		});
	}

	// ============================================================================
	/**
	 * Met à jour les champs et le statut d'un job.
	 */
	// ============================================================================
	public static async update(
		id: string,
		data: Prisma.JobUpdateInput,
		tx: Prisma.TransactionClient | PrismaClient = prisma,
	) {
		return tx.job.update({
			where: { id },
			data,
		});
	}

	// ============================================================================
	/**
	 * Compte le nombre de jobs actifs (PENDING ou IN_PROGRESS) d'une discussion.
	 */
	// ============================================================================
	public static async countActiveJobsByConversation(conversationId: string): Promise<number> {
		return prisma.job.count({
			where: {
				conversation_id: conversationId,
				status: { in: ["PENDING", "IN_PROGRESS"] },
			},
		});
	}

	// ============================================================================
	/**
	 * Recherche les jobs bloqués n'ayant pas reçu de mise à jour depuis limitDate.
	 */
	// ============================================================================
	public static async findStuckJobs(limitDate: Date) {
		return prisma.job.findMany({
			where: {
				status: {
					in: ["PENDING", "IN_PROGRESS"] as Status[],
				},
				updated_at: {
					lt: limitDate,
				},
			},
			select: { id: true, status: true, assistant_message_id: true },
		});
	}

	// ============================================================================
	/**
	 * Récupère l'ensemble des jobs actuellement actifs (PENDING ou IN_PROGRESS).
	 */
	// ============================================================================
	public static async findActiveJobs() {
		return prisma.job.findMany({
			where: {
				status: {
					in: ["PENDING", "IN_PROGRESS"] as Status[],
				},
			},
			select: { id: true, status: true },
		});
	}
}
