import pino from "pino";
import { env } from "./env";
import { traceStorage } from "./trace";

export const logger = pino({
	level: process.env.LOG_LEVEL || (env.NODE_ENV === "production" || env.NODE_ENV === "test" ? "info" : "debug"),
	mixin() {
		const store = traceStorage.getStore();
		return store
			? {
					correlationId: store.correlationId,
					userId: store.userId,
					email: store.email,
				}
			: {};
	},
	transport:
		env.NODE_ENV === "development"
			? {
					target: "pino-pretty",
					options: {
						colorize: true,
						translateTime: "SYS:standard",
						ignore: "pid,hostname,label",
					},
				}
			: undefined,
});

export interface ILogger {
	debug: (message: string, meta?: Record<string, unknown>) => void;
	info: (message: string, meta?: Record<string, unknown>) => void;
	warn: (message: string, meta?: Record<string, unknown>) => void;
	error: (message: string, error?: Error | unknown, meta?: Record<string, unknown>) => void;
}

// ============================================================================
/**
 * Adaptateur de journalisation structurée basé sur Pino avec injection de contexte.
 */
// ============================================================================
class PinoLogger implements ILogger {
	private childLogger: ReturnType<typeof logger.child>;

	constructor(label: string) {
		this.childLogger = logger.child({ label });
	}

	// ============================================================================
	/**
	 * Journalise un message de niveau DEBUG.
	 */
	// ============================================================================
	debug(message: string, meta?: Record<string, unknown>): void {
		this.childLogger.debug(meta || {}, message);
	}

	// ============================================================================
	/**
	 * Journalise un message informatif de niveau INFO.
	 */
	// ============================================================================
	info(message: string, meta?: Record<string, unknown>): void {
		this.childLogger.info(meta || {}, message);
	}

	// ============================================================================
	/**
	 * Journalise un avertissement de niveau WARN.
	 */
	// ============================================================================
	warn(message: string, meta?: Record<string, unknown>): void {
		this.childLogger.warn(meta || {}, message);
	}

	// ============================================================================
	/**
	 * Journalise une erreur avec stack trace ou métadonnées de niveau ERROR.
	 */
	// ============================================================================
	error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
		if (error !== undefined) {
			if (error instanceof Error) {
				this.childLogger.error({ ...meta, err: error }, message);
			} else {
				this.childLogger.error({ ...meta, error: String(error) }, message);
			}
		} else {
			this.childLogger.error(meta || {}, message);
		}
	}
}

// ============================================================================
/**
 * Fabrique d'instances de loggers labellisés avec corrélation de trace.
 */
// ============================================================================
export const LoggerFactory = {
	// ============================================================================
	/**
	 * Crée ou instancie un logger dédié pour un module ou domaine donné.
	 */
	// ============================================================================
	getLogger(label: string): ILogger {
		return new PinoLogger(label);
	},
};
