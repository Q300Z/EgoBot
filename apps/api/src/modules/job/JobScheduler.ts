import { createSafeInterval, type SafeIntervalHandle } from "../../core/scheduler/safeInterval";
import { eventBus } from "../../core/bus/eventBus";
import { JobCommands } from "./job.commands";
import { LoggerFactory } from "../../config/logger";

const logger = LoggerFactory.getLogger("JobScheduler");

// ============================================================================
/**
 * Planificateur de tâches récurrentes de maintenance des jobs (crons).
 */
// ============================================================================
export class JobScheduler {
	private static tasks: SafeIntervalHandle[] = [];

	// ============================================================================
	/**
	 * Démarre les tâches périodiques sécurisées de maintenance des jobs.
	 */
	// ============================================================================
	public static start(): void {
		if (this.tasks.length > 0) return;

		this.tasks = [
			// 1. Cron : Libération des jobs différés (toutes les 10 secondes)
			createSafeInterval(
				async () => {
					const result = await eventBus.request(JobCommands.releaseDeferred, {});
					logger.debug(`Nombre de jobs libérés : ${result.releasedCount}`);
				},
				{
					name: "Poller de jobs différés",
					intervalMs: 10 * 1000,
					runImmediately: true,
				},
			),

			// 2. Cron : Passage en échec des jobs bloqués (toutes les 15 minutes)
			createSafeInterval(
				async () => {
					const result = await eventBus.request(JobCommands.cleanupStuck, {});
					logger.info(`Nombre de jobs bloqués nettoyés : ${result.cleanedCount}`);
				},
				{
					name: "Vérificateur de jobs bloqués",
					intervalMs: 15 * 60 * 1000,
					runImmediately: false,
				},
			),
		];

		this.tasks.forEach((task) => task.start());
		logger.info(`JobScheduler démarré avec ${this.tasks.length} cron sécurisé.`);
	}

	// ============================================================================
	/**
	 * Arrête toutes les tâches périodiques de maintenance des jobs.
	 */
	// ============================================================================
	public static stop(): void {
		this.tasks.forEach((task) => task.stop());
		this.tasks = [];
		logger.info("JobScheduler arrêté.");
	}
}
