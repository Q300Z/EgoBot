import { createClientPool } from "redis";
import { env } from "./env";
import { LoggerFactory } from "./logger";
import { traceStorage } from "./trace";

function getValkeyConnectionDetails() {
	const url = env.VALKEY_URL || env.REDIS_URL;
	if (url) {
		try {
			const parsed = new URL(url);
			return {
				host: parsed.hostname || env.CACHE_HOSTNAME,
				port: parsed.port ? Number(parsed.port) : env.CACHE_PORT,
				password: parsed.password || env.CACHE_PASSWORD || undefined,
				database:
					parsed.pathname && parsed.pathname.length > 1
						? Number(parsed.pathname.slice(1))
						: env.CACHE_DB_NAME,
			};
		} catch {
			// Fallback direct
		}
	}
	return {
		host: env.CACHE_HOSTNAME,
		port: env.CACHE_PORT,
		password: env.CACHE_PASSWORD || undefined,
		database: env.CACHE_DB_NAME,
	};
}

const { host, port, password, database } = getValkeyConnectionDetails();

const logger = LoggerFactory.getLogger("ValkeyClient");

/**
 * Stratégie de reconnexion avec jitter pour éviter les tempêtes de connexion.
 */
export function reconnectStrategy(retries: number) {
	const base = Math.min(retries * 100, 2000);
	const jitter = Math.random() * 200;
	return base + jitter;
}

/**
 * Options communes à tous les pools de connexion Valkey.
 */
function baseOptions(RESP: 2 | 3) {
	return {
		RESP,
		socket: { host, port, reconnectStrategy },
		password: password || undefined,
		database,
	};
}

/**
 * Proxy de journalisation pour tracer de manière transparente toutes les requêtes Valkey.
 */
function wrapWithLogging<T extends object>(client: T, name: string): T {
	return new Proxy(client, {
		get(target: T, prop: PropertyKey, receiver: T) {
			const original = Reflect.get(target, prop, receiver);

			if (typeof original !== "function") {
				return original;
			}

			const wrapped = (...args: never[]) => {
				const stringProp = String(prop);
				const enableValkeyLogs = false; // Flag pour activer/désactiver temporairement les logs Valkey
				if (
					enableValkeyLogs &&
					![
						"on",
						"emit",
						"connect",
						"disconnect",
						"quit",
						"ping",
						"constructor",
						"addListener",
						"removeListener",
					].includes(stringProp) &&
					!stringProp.startsWith("_")
				) {
					const correlationId = traceStorage.getStore()?.correlationId ?? "no-trace";
					logger.info(
						`[Valkey:${name}] Command: "${stringProp}" | args: ${JSON.stringify(args)} | correlation: ${correlationId}`,
					);
				}
				const result = Reflect.apply(original, target, args);

				if (result === target) {
					return receiver;
				}

				if (stringProp === "multi" && result !== null && typeof result === "object") {
					return wrapWithLogging(result, `${name}:Multi`);
				}

				return result;
			};
			return wrapped;
		},
	});
}

// Client flux (RESP2) dédié à la lecture des streams Valkey.
const rawStream = createClientPool(baseOptions(2), {
	minimum: 5,
	maximum: 20,
});
rawStream.on("error", (err: Error) => logger.error("Erreur sur le pool Valkey Stream", err));
export const valkeyStream = wrapWithLogging(rawStream, "Stream");

// Client de lecture (RESP3) avec pool de connexions pour les données utilisateur.
const rawReader = createClientPool(baseOptions(3), {
	minimum: 2,
	maximum: 6,
});
rawReader.on("error", (err: Error) => logger.error("Erreur sur le pool Valkey Reader", err));
export const valkeyReader = wrapWithLogging(rawReader, "Reader");

// Client d'écriture (RESP3) pour les signaux d'annulation et le stockage des sessions.
const rawWriter = createClientPool(baseOptions(3), {
	minimum: 2,
	maximum: 6,
});
rawWriter.on("error", (err: Error) => logger.error("Erreur sur le pool Valkey Writer", err));
export const valkeyWriter = wrapWithLogging(rawWriter, "Writer");

/**
 * Initialise toutes les connexions Valkey en parallèle.
 */
export async function connectValkeyClients(): Promise<void> {
	await Promise.all([rawStream.connect(), rawReader.connect(), rawWriter.connect()]);
	logger.info("Tous les pools Valkey sont connectés.");
}

// Alias de rétrocompatibilité Redis
export const redisStream = valkeyStream;
export const redisReader = valkeyReader;
export const redisWriter = valkeyWriter;
export const connectRedisClients = connectValkeyClients;
