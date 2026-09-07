import { JobService } from "./JobService";
import { JobScheduler } from "./JobScheduler";

export * from "./job.schema";
export * from "./job.commands";
export * from "./job.events";
export * from "./job.streams";
export * from "./JobRepository";
export * from "./JobStreamHandler";
export * from "./JobScheduler";
export * from "./JobService";

// ============================================================================
/**
 * Initialise le module Job en enregistrant ses commandes et écouteurs sur l'EventBus.
 */
// ============================================================================
export function initJobModule(): void {
	JobService.init();
}

// ============================================================================
/**
 * Démarre le polling des flux et les tâches planifiées de maintenance des jobs.
 */
// ============================================================================
export function startJobScheduler(): void {
	JobService.startPolling();
	JobScheduler.start();
}

// ============================================================================
/**
 * Arrête les planificateurs et libère les ressources du module Job.
 */
// ============================================================================
export function stopJobModule(): void {
	JobScheduler.stop();
	JobService.stop();
}
