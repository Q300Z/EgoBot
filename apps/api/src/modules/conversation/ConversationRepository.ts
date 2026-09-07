import { prisma } from "../../config/db";
import { redisWriter } from "../../config/redis";
import type { Model } from "@prisma/client";
import { eventBus } from "../../core/bus/eventBus";
import { JobEvents } from "../job/job.events";

// ============================================================================
/**
 * Référentiel d'accès aux données des conversations dans SQLite / Prisma.
 */
// ============================================================================
export class ConversationRepository {
	// ============================================================================
	/**
	 * Récupère les conversations actives d'un utilisateur pour un modèle donné.
	 */
	// ============================================================================
	public static async findMany(userId: string, clientId: string, model: string) {
		return prisma.conversation.findMany({
			where: {
				user_id: userId,
				client_id: clientId,
				model: model as Model,
				deleted_at: null,
			},
			orderBy: {
				updated_at: "desc",
			},
		});
	}

	// ============================================================================
	/**
	 * Récupère une conversation spécifique par son identifiant avec ses messages.
	 */
	// ============================================================================
	public static async findById(id: string, userId: string) {
		return prisma.conversation.findUnique({
			where: {
				id,
				user_id: userId,
				deleted_at: null,
			},
			include: {
				messages: {
					orderBy: {
						created_at: "asc",
					},
				},
			},
		});
	}

	// ============================================================================
	/**
	 * Crée une nouvelle conversation ou met à jour la date d'activité de l'existante.
	 */
	// ============================================================================
	public static async ensureExists(data: {
		id: string;
		user_id: string;
		client_id: string;
		title: string;
		model: Model;
	}) {
		const existing = await prisma.conversation.findUnique({
			where: { id: data.id },
		});

		if (!existing) {
			return prisma.conversation.create({
				data: {
					id: data.id,
					user_id: data.user_id,
					client_id: data.client_id,
					title: data.title,
					model: data.model,
				},
			});
		}

		if (existing.user_id !== data.user_id) {
			throw new Error("Accès refusé à cette discussion.");
		}

		return prisma.conversation.update({
			where: { id: data.id },
			data: { updated_at: new Date() },
		});
	}

	// ============================================================================
	/**
	 * Marque logiquement une conversation comme supprimée et annule ses jobs.
	 */
	// ============================================================================
	public static async deleteLogical(id: string, userId: string, dev: string = "false"): Promise<boolean> {
		const conversation = await prisma.conversation.findUnique({
			where: { id, user_id: userId },
			select: { id: true, jobs: { select: { id: true } } },
		});

		if (!conversation) {
			return false;
		}

		// 1. Suppression logique de la conversation en base
		await prisma.conversation.update({
			where: { id: conversation.id },
			data: { deleted_at: new Date() },
		});

		// 2. Nettoyage asynchrone des ressources associées dans Redis et annulation des jobs en cours
		const pipeline = redisWriter.multi();
		const env = dev === "true" ? "dev" : "prod";

		for (const job of conversation.jobs) {
			const streamKey = `jobs:sse:${env}:${job.id}`;
			pipeline.del(streamKey);
			eventBus.emit(JobEvents.cancelRequest, { jobId: job.id, dev });
		}

		await pipeline.exec();
		return true;
	}

	// ============================================================================
	/**
	 * Supprime logiquement les conversations anciennes de plus de 30 jours.
	 */
	// ============================================================================
	public static async cleanupOld(): Promise<number> {
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

		const result = await prisma.conversation.updateMany({
			where: {
				deleted_at: { lt: thirtyDaysAgo },
			},
			data: {
				deleted_at: new Date(),
			},
		});

		return result.count;
	}
}
