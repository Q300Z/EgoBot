import { StreamKeys, defineWorkerQueue } from "../../core/stream";
import { JobCreateRequestSchema } from "./job.commands";

// ============================================================================
/**
 * Fabrique des clés de flux Redis dédiées au domaine Job.
 */
// ============================================================================
export const JobStreamKeys = {
	// ============================================================================
	/**
	 * File d'inférence active pour un modèle donné : jobs:queue:<env>:<model>.
	 */
	// ============================================================================
	queue: (env: "dev" | "prod" | string, model: string) => StreamKeys.queue(env, model),

	// ============================================================================
	/**
	 * Flux SSE d'événements et de tokens d'un job : jobs:sse:<env>:<jobId>.
	 */
	// ============================================================================
	sse: (env: "dev" | "prod" | string, jobId: string) => StreamKeys.sse(env, jobId),

	// ============================================================================
	/**
	 * Sorted set Redis pour les jobs différés dans le temps.
	 */
	// ============================================================================
	deferred: "jobs:deferred",

	// ============================================================================
	/**
	 * Clé de stockage temporaire de l'environnement d'un job (TTL 12h).
	 */
	// ============================================================================
	jobEnv: (jobId: string) => StreamKeys.jobEnv(jobId),

	// ============================================================================
	/**
	 * Clé de signal d'annulation d'un job.
	 */
	// ============================================================================
	cancel: (jobId: string) => StreamKeys.cancel(jobId),
};

// ============================================================================
/**
 * File de worker CHATBOT pour l'inférence temps réel avec restitution rapide des tokens SSE (100ms).
 */
// ============================================================================
export const ChatbotWorkerQueue = defineWorkerQueue({
	workerType: "CHATBOT",
	pollIntervalMs: 100,
	requestSchema: JobCreateRequestSchema,
	terminalEvents: ["job.completed", "job.failed", "job.cancelled"],
});
