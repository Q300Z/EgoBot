import { z } from "zod";
import { defineCommand } from "../../core/bus/bus.types";
import { EgobotConfigSchema } from "../auth/auth.schema";

// ============================================================================
/**
 * Schéma de la commande de création d'un job.
 */
// ============================================================================
export const JobCreateRequestSchema = z
	.object({
		jobId: z.string().min(1),
		conversationId: z.string().min(1),
		userId: z.string(),
		userEmail: z.email(),
		userClientId: z.string(),
		prompt: z.string().min(1),
		EgobotConfig: EgobotConfigSchema,
		correlationId: z.string().optional(),
		executeAt: z.string().datetime().optional(),
	})
	.passthrough();

// ============================================================================
/**
 * Schéma de la commande d'annulation d'un job.
 */
// ============================================================================
export const JobCancelRequestSchema = z
	.object({
		jobId: z.string().min(1),
		
		correlationId: z.string().optional(),
	})
	.passthrough();

// ============================================================================
/**
 * Schéma de la commande de redirection différée d'un job.
 */
// ============================================================================
export const JobDeferRequestSchema = z
	.object({
		jobId: z.string().min(1),
		targetModel: z.string(),
		
	})
	.passthrough();

// ============================================================================
/**
 * Commandes métier du domaine Job (Request/Reply).
 */
// ============================================================================
export const JobCommands = {
	// ============================================================================
	/**
	 * Commande de création et d'enfilement d'un job d'inférence.
	 */
	// ============================================================================
	create: defineCommand(
		"job.create",
		JobCreateRequestSchema,
		z.object({
			jobId: z.string(),
			conversationId: z.string(),
		}),
	),

	// ============================================================================
	/**
	 * Commande d'annulation immédiate d'un job.
	 */
	// ============================================================================
	cancel: defineCommand(
		"job.cancel",
		JobCancelRequestSchema,
		z.object({
			jobId: z.string(),
			status: z.literal("CANCELLED"),
		}),
	),

	// ============================================================================
	/**
	 * Commande de redirection et replanification d'un job vers un autre modèle.
	 */
	// ============================================================================
	defer: defineCommand(
		"job.defer",
		JobDeferRequestSchema,
		z.object({
			success: z.boolean(),
			newJobId: z.string().optional(),
		}),
	),

	// ============================================================================
	/**
	 * Commande de récupération d'un job par son identifiant unique.
	 */
	// ============================================================================
	getById: defineCommand(
		"job.get_by_id",
		z.object({ id: z.string() }),
		z
			.object({
				id: z.string(),
				conversation_id: z.string(),
				status: z.string(),
				model: z.string(),
			})
			.nullable(),
	),

	// ============================================================================
	/**
	 * Commande de libération des jobs différés échus.
	 */
	// ============================================================================
	releaseDeferred: defineCommand(
		"job.release_deferred",
		z.object({}).optional().default({}),
		z.object({ releasedCount: z.number() }),
	),

	// ============================================================================
	/**
	 * Commande de nettoyage des jobs bloqués ou abandonnés.
	 */
	// ============================================================================
	cleanupStuck: defineCommand(
		"job.cleanup_stuck",
		z.object({}).optional().default({}),
		z.object({ cleanedCount: z.number() }),
	),
};

export type JobCreateRequest = z.infer<typeof JobCreateRequestSchema>;
export type JobCancelRequest = z.infer<typeof JobCancelRequestSchema>;
export type JobDeferRequest = z.infer<typeof JobDeferRequestSchema>;
