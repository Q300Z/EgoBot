import { LoggerFactory } from "../../config/logger";

const defaultLogger = LoggerFactory.getLogger("SafeScheduler");

export interface SafeIntervalOptions {
	/** Nom descriptif de la tâche (pour les logs et le diagnostic) */
	name: string;
	/** Intervalle en millisecondes entre deux exécutions */
	intervalMs: number;
	/** Si true, déclenche une première exécution immédiatement sans attendre le délai */
	runImmediately?: boolean;
	/** Hook optionnel de gestion des erreurs */
	onError?: (error: unknown, taskName: string) => void | Promise<void>;
}

export interface SafeIntervalHandle {
	start: () => void;
	stop: () => void;
	isExecuting: () => boolean;
}

// ============================================================================
/**
 * Crée un intervalle d'exécution récurrent sécurisé et anti-chevauchement.
 */
// ============================================================================
export function createSafeInterval(task: () => Promise<void>, options: SafeIntervalOptions): SafeIntervalHandle {
	const { name, intervalMs, runImmediately = false, onError } = options;
	let timer: NodeJS.Timeout | null = null;
	let isRunning = false;
	let executing = false;

	const execute = async () => {
		if (!isRunning) return;
		if (executing) {
			defaultLogger.warn(`[SafeInterval] La tâche [${name}] est déjà en cours. Exécution sautée.`);
			return;
		}

		executing = true;
		try {
			await task();
		} catch (error: unknown) {
			defaultLogger.error(`[SafeInterval] Erreur dans la tâche [${name}] :`, error);
			if (onError) {
				try {
					await onError(error, name);
				} catch (handlerError) {
					defaultLogger.error(`[SafeInterval] Échec du hook onError pour [${name}] :`, handlerError);
				}
			}
		} finally {
			executing = false;
			if (isRunning) {
				timer = setTimeout(execute, intervalMs);
			}
		}
	};

	return {
		start: () => {
			if (isRunning) return;
			isRunning = true;
			defaultLogger.info(`[SafeInterval] Tâche [${name}] démarrée (${intervalMs}ms).`);
			if (runImmediately) {
				void execute();
			} else {
				timer = setTimeout(execute, intervalMs);
			}
		},
		stop: () => {
			isRunning = false;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			defaultLogger.info(`[SafeInterval] Tâche [${name}] arrêtée.`);
		},
		isExecuting: () => executing,
	};
}
