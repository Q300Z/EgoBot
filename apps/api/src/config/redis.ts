import { createClientPool } from "redis";
import { env } from "./env";
import { LoggerFactory } from "./logger";
import { traceStorage } from "./trace";

const host = env.CACHE_HOSTNAME;
const port = env.CACHE_PORT;
const password = env.CACHE_PASSWORD;
const database = env.CACHE_DB_NAME;

const logger = LoggerFactory.getLogger("RedisClient");

/**
 * Stratégie de reconnexion avec jitter (bruit aléatoire) pour éviter les tempêtes de connexion.
 */
export function reconnectStrategy(retries: number) {
	const base = Math.min(retries * 100, 2000);
	const jitter = Math.random() * 200;
	return base + jitter;
}

/**
 * Options communes à tous les pools de connexion.
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
 * Proxy de journalisation pour tracer de manière transparente toutes les requêtes Redis.
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
				const enableRedisLogs = false; // Flag pour activer/désactiver temporairement les logs Redis
				if (
					enableRedisLogs &&
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
						`[Redis:${name}] Command: "${stringProp}" | args: ${JSON.stringify(args)} | correlation: ${correlationId}`,
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

// Client flux (RESP2) dédié à la lecture des streams.
const rawStream = createClientPool(baseOptions(2), {
	minimum: 5,
	maximum: 20,
});
rawStream.on("error", (err: Error) => logger.error("Erreur sur le pool Redis Stream", err));
export const redisStream = wrapWithLogging(rawStream, "Stream");

// Client de lecture (RESP3) avec pool de connexions pour les données utilisateur.
const rawReader = createClientPool(baseOptions(3), {
	minimum: 2,
	maximum: 6,
});
rawReader.on("error", (err: Error) => logger.error("Erreur sur le pool Redis Reader", err));
export const redisReader = wrapWithLogging(rawReader, "Reader");

// Client d'écriture (RESP3) pour les signaux d'annulation et le stockage des sessions Logipol.
const rawWriter = createClientPool(baseOptions(3), {
	minimum: 2,
	maximum: 6,
});
rawWriter.on("error", (err: Error) => logger.error("Erreur sur le pool Redis Writer", err));
export const redisWriter = wrapWithLogging(rawWriter, "Writer");

/**
 * Initialise toutes les connexions Redis en parallèle.
 */
export async function connectRedisClients(): Promise<void> {
	await Promise.all([rawStream.connect(), rawReader.connect(), rawWriter.connect()]);
	logger.info("Tous les pools Redis sont connectés.");
}
