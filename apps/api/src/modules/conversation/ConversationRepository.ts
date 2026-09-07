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
	 * Récupère les conversations actives d'un utilisateur pour un modèle donné,
	 * avec support optionnel de la pagination et de la recherche par titre.
	 */
	// ============================================================================
	public static async findMany(
		userId: string,
		clientId: string,
		model: string,
		options?: { page?: number; pageSize?: number; search?: string },
	) {
		const where: any = {
			user_id: userId,
			client_id: clientId,
			model: model as Model,
			deleted_at: null,
		};

		if (options?.search) {
			where.title = { contains: options.search };
		}

		if (options?.page !== undefined || options?.pageSize !== undefined) {
			const page = Math.max(1, options.page ?? 1);
			const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 20));
			const skip = (page - 1) * pageSize;

			const [items, total] = await Promise.all([
				prisma.conversation.findMany({
					where,
					orderBy: {
						updated_at: "desc",
					},
					skip,
					take: pageSize,
				}),
				prisma.conversation.count({ where }),
			]);

			return {
				items,
				total,
				page,
				pageSize,
				totalPages: Math.ceil(total / pageSize),
			};
		}

		return prisma.conversation.findMany({
			where,
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
	 * Suppression logique des conversations inactives depuis plus de 15 jours.
	 */
	// ============================================================================
	public static async softDeleteInactiveOlderThan(days: number = 15): Promise<number> {
		const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

		const result = await prisma.conversation.updateMany({
			where: {
				deleted_at: null,
				updated_at: { lt: threshold },
			},
			data: {
				deleted_at: new Date(),
			},
		});

		return result.count;
	}

	// ============================================================================
	/**
	 * Purge physique (définitive) des conversations supprimées logiquement depuis plus de 6 mois (180 jours).
	 */
	// ============================================================================
	public static async purgeDeletedOlderThan(days: number = 180): Promise<number> {
		const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

		const toPurge = await prisma.conversation.findMany({
			where: {
				deleted_at: { lte: threshold },
			},
			select: { id: true },
		});

		if (toPurge.length === 0) {
			return 0;
		}

		const ids = toPurge.map((c) => c.id);

		await prisma.$transaction([
			prisma.job.deleteMany({ where: { conversation_id: { in: ids } } }),
			prisma.message.deleteMany({ where: { conversation_id: { in: ids } } }),
			prisma.conversation.deleteMany({ where: { id: { in: ids } } }),
		]);

		return ids.length;
	}

	// ============================================================================
	/**
	 * Rétrocompatibilité : nettoie les conversations inactives de plus de 15 jours.
	 */
	// ============================================================================
	public static async cleanupOld(): Promise<number> {
		return this.softDeleteInactiveOlderThan(15);
	}
}
