import { createSafeInterval, type SafeIntervalHandle } from "../../core/scheduler/safeInterval";
import { eventBus } from "../../core/bus/eventBus";
import { ConversationCommands } from "./conversation.commands";
import { LoggerFactory } from "../../config/logger";

const logger = LoggerFactory.getLogger("ConversationScheduler");

// ============================================================================
/**
 * Planificateur de tâches récurrentes de maintenance des conversations (crons).
 */
// ============================================================================
export class ConversationScheduler {
	private static tasks: SafeIntervalHandle[] = [];

	// ============================================================================
	/**
	 * Démarre les tâches périodiques sécurisées de maintenance des conversations.
	 */
	// ============================================================================
	public static start(): void {
		if (this.tasks.length > 0) return;

		this.tasks = [
			// 1. Cron : Suppression logique des conversations inactives depuis plus de 15 jours (toutes les 15 minutes)
			createSafeInterval(
				async () => {
					await eventBus.request(ConversationCommands.cleanupOld, { days: 15 });
				},
				{
					name: "Suppression logique conversations inactives (15j)",
					intervalMs: 15 * 60 * 1000,
					runImmediately: false,
				},
			),
			// 2. Cron : Purge physique définitive des conversations supprimées depuis plus de 6 mois (toutes les heures)
			createSafeInterval(
				async () => {
					await eventBus.request(ConversationCommands.purgeDeleted, { days: 180 });
				},
				{
					name: "Purge définitive conversations supprimées (6 mois)",
					intervalMs: 60 * 60 * 1000,
					runImmediately: false,
				},
			),
		];

		this.tasks.forEach((task) => task.start());
		logger.info(`ConversationScheduler démarré avec ${this.tasks.length} crons sécurisés.`);
	}

	// ============================================================================
	/**
	 * Arrête toutes les tâches périodiques de maintenance des conversations.
	 */
	// ============================================================================
	public static stop(): void {
		this.tasks.forEach((task) => task.stop());
		this.tasks = [];
		logger.info("ConversationScheduler arrêté.");
	}
}
