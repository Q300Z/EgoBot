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
			// 1. Cron : Nettoyage des conversations anciennes de plus de 30 jours (toutes les 15 minutes)
			createSafeInterval(
				async () => {
					await eventBus.request(ConversationCommands.cleanupOld, {});
				},
				{
					name: "Nettoyeur de conversations de plus de 30 jours",
					intervalMs: 15 * 60 * 1000,
					runImmediately: false,
				},
			),
		];

		this.tasks.forEach((task) => task.start());
		logger.info(`ConversationScheduler démarré avec ${this.tasks.length} cron sécurisé.`);
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
