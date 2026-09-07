import { EventEmitter } from "node:events";
import {
	GlideClient,
	type GlideClientConfiguration,
	ProtocolVersion,
	Transaction,
	ClientSideCache,
	ValkeyError,
	ClosingError,
	RequestError,
	TimeoutError,
	ConnectionError,
	ExecAbortError,
	ConfigurationError,
	CircuitBreakerError,
} from "@valkey/valkey-glide";
import { env, isProd } from "./env";
import { LoggerFactory } from "./logger";
import { traceStorage } from "./trace";

const logger = LoggerFactory.getLogger("ValkeyClient");

export {
	GlideClient,
	type GlideClientConfiguration,
	ProtocolVersion,
	Transaction,
	ClientSideCache,
	ValkeyError,
	ClosingError,
	RequestError,
	TimeoutError,
	ConnectionError,
	ExecAbortError,
	ConfigurationError,
	CircuitBreakerError,
};

/**
 * Fonctions de garde de types pour les erreurs Valkey GLIDE.
 */
export function isTimeoutError(err: unknown): err is TimeoutError {
	return err instanceof TimeoutError;
}

export function isConnectionError(err: unknown): err is ConnectionError {
	return err instanceof ConnectionError;
}

export function isCircuitBreakerError(err: unknown): err is CircuitBreakerError {
	return err instanceof CircuitBreakerError;
}

export function isValkeyError(err: unknown): err is ValkeyError {
	return err instanceof ValkeyError;
}

/**
 * Résout les paramètres de connexion à Valkey depuis l'environnement.
 */
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

/**
 * Stratégie de reconnexion avec jitter pour éviter les tempêtes de connexion.
 */
export function reconnectStrategy(retries: number) {
	const base = Math.min(retries * 100, 2000);
	const jitter = Math.random() * 200;
	return base + jitter;
}

export interface GlideConfigCustomOptions {
	protocol: ProtocolVersion;
	enableClientSideCache?: boolean;
	cacheSizeKb?: number;
	cacheTtlMs?: number;
	enableCircuitBreaker?: boolean;
}

/**
 * Génère la configuration GlideClient adaptée au protocole demandé avec support
 * de Client-Side Cache et de Circuit Breaker.
 */
export function createGlideConfig(options: GlideConfigCustomOptions | ProtocolVersion): GlideClientConfiguration {
	const opts: GlideConfigCustomOptions =
		typeof options === "number" ? { protocol: options } : options;

	const isProduction = isProd();
	const circuitBreakerEnabled =
		opts.enableCircuitBreaker !== undefined
			? opts.enableCircuitBreaker
			: env.VALKEY_ENABLE_CIRCUIT_BREAKER !== undefined
				? env.VALKEY_ENABLE_CIRCUIT_BREAKER
				: isProduction;

	const clientSideCacheEnabled =
		opts.enableClientSideCache !== undefined
			? opts.enableClientSideCache
			: env.VALKEY_ENABLE_CLIENT_CACHE;

	const config: GlideClientConfiguration = {
		addresses: [{ host: host || "127.0.0.1", port: port || 6379 }],
		...(password ? { credentials: { password } } : {}),
		...(database !== undefined && database !== null ? { databaseId: database } : {}),
		protocol: opts.protocol,
		connectionBackoff: {
			numberOfRetries: 10,
			factor: 100,
			exponentBase: 2,
			jitterPercent: 20,
		},
		...(clientSideCacheEnabled
			? {
					clientSideCache: ClientSideCache.create(
						opts.cacheSizeKb ?? env.VALKEY_CACHE_SIZE_KB,
						opts.cacheTtlMs ?? env.VALKEY_CACHE_TTL_MS,
					),
				}
			: {}),
		...(circuitBreakerEnabled
			? {
					clientCircuitBreaker: {
						windowSizeMs: 10000,
						failureRateThreshold: 0.5,
						minErrors: 10,
						openTimeoutMs: 5000,
						countTimeouts: true,
						consecutiveSuccesses: 3,
					},
				}
			: {}),
	};

	return config;
}

/**
 * Normalise les champs d'un flux Valkey sous forme de Record<string, string>.
 */
export function parseStreamFields(fields: any): Record<string, string> {
	const message: Record<string, string> = {};
	if (!fields) return message;

	if (Array.isArray(fields)) {
		if (fields.length > 0 && Array.isArray(fields[0])) {
			for (const pair of fields) {
				if (Array.isArray(pair) && pair.length >= 2) {
					message[String(pair[0])] = String(pair[1]);
				}
			}
		} else if (
			fields.length > 0 &&
			typeof fields[0] === "object" &&
			fields[0] !== null &&
			("key" in fields[0] || "field" in fields[0])
		) {
			for (const item of fields) {
				const k = item.key ?? item.field;
				const v = item.value;
				if (k !== undefined && v !== undefined) {
					message[String(k)] = typeof v === "string" ? v : Buffer.isBuffer(v) ? v.toString("utf8") : String(v);
				}
			}
		} else {
			for (let i = 0; i < fields.length; i += 2) {
				message[String(fields[i])] = String(fields[i + 1]);
			}
		}
	} else if (fields instanceof Map) {
		for (const [k, v] of fields.entries()) {
			message[String(k)] = typeof v === "string" ? v : Buffer.isBuffer(v) ? v.toString("utf8") : String(v);
		}
	} else if (typeof fields === "object") {
		for (const [k, v] of Object.entries(fields)) {
			message[k] = typeof v === "string" ? v : Buffer.isBuffer(v) ? v.toString("utf8") : String(v);
		}
	}
	return message;
}

/**
 * Normalise une liste d'entrées de flux Valkey / Redis sous la forme attendue par l'API :
 * Array<{ id: string, message: Record<string, string> }>
 */
export function parseStreamEntries(raw: any): Array<{ id: string; message: Record<string, string> }> {
	if (!raw) return [];
	if (!Array.isArray(raw)) {
		if (raw instanceof Map) {
			return Array.from(raw.entries()).map(([id, fields]) => ({
				id: String(id),
				message: parseStreamFields(fields),
			}));
		}
		if (typeof raw === "object") {
			return Object.entries(raw).map(([id, fields]) => ({
				id,
				message: parseStreamFields(fields),
			}));
		}
		return [];
	}

	const results: Array<{ id: string; message: Record<string, string> }> = [];
	for (const item of raw) {
		if (!item) continue;
		if (item.id && (item.message || item.fields)) {
			results.push({
				id: String(item.id),
				message: parseStreamFields(item.message || item.fields),
			});
			continue;
		}
		if (item.key !== undefined && item.value !== undefined) {
			results.push({
				id: String(item.key),
				message: parseStreamFields(item.value),
			});
			continue;
		}
		if (Array.isArray(item) && item.length >= 2) {
			results.push({
				id: String(item[0]),
				message: parseStreamFields(item[1]),
			});
		}
	}
	return results;
}

/**
 * Adaptateur de transaction (multi/pipeline) compatible node-redis et Valkey Glide.
 */
export class ValkeyMultiAdapter {
	private tx: Transaction;
	private client: ValkeyClientAdapter;

	constructor(client: ValkeyClientAdapter) {
		this.client = client;
		this.tx = new Transaction();
	}

	public xAdd(
		key: string,
		id: string,
		message: Record<string, any>,
		options?: { TRIM?: { strategy: string; threshold: number; strategyModifier?: string } },
	): this {
		const args: string[] = ["XADD", key];
		if (options?.TRIM) {
			args.push(options.TRIM.strategy);
			if (options.TRIM.strategyModifier) {
				args.push(options.TRIM.strategyModifier);
			}
			args.push(String(options.TRIM.threshold));
		}
		args.push(id || "*");
		for (const [k, v] of Object.entries(message)) {
			args.push(k, typeof v === "string" ? v : JSON.stringify(v));
		}
		this.tx.customCommand(args);
		return this;
	}

	public xadd(
		key: string,
		id: string,
		message: Record<string, any>,
		options?: { TRIM?: { strategy: string; threshold: number; strategyModifier?: string } },
	): this {
		return this.xAdd(key, id, message, options);
	}

	public expire(key: string, seconds: number): this {
		this.tx.customCommand(["EXPIRE", key, String(seconds)]);
		return this;
	}

	public set(key: string, value: string, options?: { EX?: number; PX?: number }): this {
		const args = ["SET", key, value];
		if (options?.EX !== undefined) {
			args.push("EX", String(options.EX));
		} else if (options?.PX !== undefined) {
			args.push("PX", String(options.PX));
		}
		this.tx.customCommand(args);
		return this;
	}

	public del(...keys: (string | string[])[]): this {
		const flatKeys = keys.flat();
		if (flatKeys.length > 0) {
			this.tx.customCommand(["DEL", ...flatKeys]);
		}
		return this;
	}

	public zRem(key: string, ...members: (string | string[])[]): this {
		const flatMembers = members.flat();
		if (flatMembers.length > 0) {
			this.tx.customCommand(["ZREM", key, ...flatMembers]);
		}
		return this;
	}

	public zrem(key: string, ...members: (string | string[])[]): this {
		return this.zRem(key, ...members);
	}

	public zAdd(
		key: string,
		members: { score: number; value: string } | Array<{ score: number; value: string }>,
	): this {
		const items = Array.isArray(members) ? members : [members];
		if (items.length > 0) {
			const args: string[] = ["ZADD", key];
			for (const item of items) {
				args.push(String(item.score), item.value);
			}
			this.tx.customCommand(args);
		}
		return this;
	}

	public zadd(
		key: string,
		members: { score: number; value: string } | Array<{ score: number; value: string }>,
	): this {
		return this.zAdd(key, members);
	}

	public customCommand(args: string[]): this {
		this.tx.customCommand(args);
		return this;
	}

	public async exec(): Promise<any[]> {
		return this.client.execTransaction(this.tx);
	}
}

/**
 * Façade / Wrapper Valkey Glide fournissant une API compatible node-redis pour l'API.
 */
export class ValkeyClientAdapter extends EventEmitter {
	private rawClient: GlideClient | null = null;
	private config: GlideClientConfiguration;
	public readonly name: string;

	constructor(config: GlideClientConfiguration, name: string) {
		super();
		this.config = config;
		this.name = name;
	}

	public async connect(): Promise<void> {
		if (this.rawClient) {
			return;
		}
		try {
			this.rawClient = await GlideClient.createClient(this.config);
			this.emit("connect");
		} catch (err: unknown) {
			if (isCircuitBreakerError(err)) {
				logger.warn(`[ValkeyClientAdapter:${this.name}] Coupe-circuit ouvert (CircuitBreakerError) : requêtes suspendues`);
			} else if (isTimeoutError(err)) {
				logger.error(`[ValkeyClientAdapter:${this.name}] Délai d'expiration dépassé (TimeoutError)`);
			} else if (isConnectionError(err)) {
				logger.error(`[ValkeyClientAdapter:${this.name}] Échec de connexion réseau (ConnectionError)`);
			} else if (err instanceof ConfigurationError) {
				logger.error(`[ValkeyClientAdapter:${this.name}] Erreur de configuration (ConfigurationError)`);
			} else {
				logger.error(`[ValkeyClientAdapter:${this.name}] Erreur Valkey`, err);
			}
			this.emit("error", err);
			throw err;
		}
	}

	public async disconnect(): Promise<void> {
		if (this.rawClient) {
			this.rawClient.close();
			this.rawClient = null;
			this.emit("end");
		}
	}

	public async quit(): Promise<void> {
		return this.disconnect();
	}

	public async close(): Promise<void> {
		return this.disconnect();
	}

	public async getRawClient(): Promise<GlideClient> {
		if (!this.rawClient) {
			await this.connect();
		}
		if (!this.rawClient) {
			throw new Error(`[ValkeyClientAdapter:${this.name}] Impossible d'initialiser GlideClient.`);
		}
		return this.rawClient;
	}

	public async execTransaction(tx: Transaction): Promise<any[]> {
		const client = await this.getRawClient();
		const res = await client.exec(tx, false);
		return (res as any[]) ?? [];
	}

	public async get(key: string): Promise<string | null> {
		const client = await this.getRawClient();
		const res = await client.get(key);
		if (res === null || res === undefined) return null;
		return typeof res === "string" ? res : res.toString();
	}

	public async set(key: string, value: string, options?: { EX?: number; PX?: number }): Promise<string | null> {
		const client = await this.getRawClient();
		const args = ["SET", key, value];
		if (options?.EX !== undefined) {
			args.push("EX", String(options.EX));
		} else if (options?.PX !== undefined) {
			args.push("PX", String(options.PX));
		}
		const res = await client.customCommand(args);
		return res === null ? null : String(res);
	}

	public async del(...keys: (string | string[])[]): Promise<number> {
		const client = await this.getRawClient();
		const flatKeys = keys.flat();
		if (flatKeys.length === 0) return 0;
		const res = await client.del(flatKeys);
		return Number(res ?? 0);
	}

	public async exists(...keys: (string | string[])[]): Promise<number> {
		const client = await this.getRawClient();
		const flatKeys = keys.flat();
		if (flatKeys.length === 0) return 0;
		const res = await client.exists(flatKeys);
		return Number(res ?? 0);
	}

	public async expire(key: string, seconds: number): Promise<boolean | number> {
		const client = await this.getRawClient();
		const res = await client.expire(key, seconds);
		return res;
	}

	public async xAdd(
		key: string,
		id: string,
		message: Record<string, any>,
		options?: { TRIM?: { strategy: string; threshold: number; strategyModifier?: string } },
	): Promise<string> {
		const client = await this.getRawClient();
		const args: string[] = ["XADD", key];
		if (options?.TRIM) {
			args.push(options.TRIM.strategy);
			if (options.TRIM.strategyModifier) {
				args.push(options.TRIM.strategyModifier);
			}
			args.push(String(options.TRIM.threshold));
		}
		args.push(id || "*");
		for (const [k, v] of Object.entries(message)) {
			args.push(k, typeof v === "string" ? v : JSON.stringify(v));
		}
		const res = await client.customCommand(args);
		return String(res);
	}

	public async xadd(
		key: string,
		id: string,
		message: Record<string, any>,
		options?: { TRIM?: { strategy: string; threshold: number; strategyModifier?: string } },
	): Promise<string> {
		return this.xAdd(key, id, message, options);
	}

	public async xRange(
		key: string,
		start: string,
		end: string,
		options?: { COUNT?: number },
	): Promise<Array<{ id: string; message: Record<string, string> }>> {
		const client = await this.getRawClient();
		const args = ["XRANGE", key, start, end];
		if (options?.COUNT !== undefined) {
			args.push("COUNT", String(options.COUNT));
		}
		const res = await client.customCommand(args);
		return parseStreamEntries(res);
	}

	public async xrange(
		key: string,
		start: string,
		end: string,
		options?: { COUNT?: number },
	): Promise<Array<{ id: string; message: Record<string, string> }>> {
		return this.xRange(key, start, end, options);
	}

	public async xRevRange(
		key: string,
		end: string,
		start: string,
		options?: { COUNT?: number },
	): Promise<Array<{ id: string; message: Record<string, string> }>> {
		const client = await this.getRawClient();
		const args = ["XREVRANGE", key, end, start];
		if (options?.COUNT !== undefined) {
			args.push("COUNT", String(options.COUNT));
		}
		const res = await client.customCommand(args);
		return parseStreamEntries(res);
	}

	public async xrevrange(
		key: string,
		end: string,
		start: string,
		options?: { COUNT?: number },
	): Promise<Array<{ id: string; message: Record<string, string> }>> {
		return this.xRevRange(key, end, start, options);
	}

	public async xAutoClaim(
		key: string,
		group: string,
		consumer: string,
		minIdleTime: number,
		start: string,
		options?: { COUNT?: number; JUSTID?: boolean },
	): Promise<{ nextStartId: string; messages: Array<{ id: string; message: Record<string, string> }>; deletedIds?: string[] }> {
		const client = await this.getRawClient();
		const args = ["XAUTOCLAIM", key, group, consumer, String(minIdleTime), start];
		if (options?.COUNT !== undefined) {
			args.push("COUNT", String(options.COUNT));
		}
		if (options?.JUSTID) {
			args.push("JUSTID");
		}
		const res = await client.customCommand(args);
		if (Array.isArray(res) && res.length >= 2) {
			const nextStartId = String(res[0]);
			const messages = parseStreamEntries(res[1]);
			const deletedIds = Array.isArray(res[2]) ? res[2].map(String) : [];
			return { nextStartId, messages, deletedIds };
		}
		return { nextStartId: "0-0", messages: [] };
	}

	public async xautoclaim(
		key: string,
		group: string,
		consumer: string,
		minIdleTime: number,
		start: string,
		options?: { COUNT?: number; JUSTID?: boolean },
	) {
		return this.xAutoClaim(key, group, consumer, minIdleTime, start, options);
	}

	public async xRead(
		streams: Array<{ key: string; id: string }>,
		options?: { COUNT?: number; BLOCK?: number },
	): Promise<Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null> {
		const client = await this.getRawClient();
		const args = ["XREAD"];
		if (options?.COUNT !== undefined) {
			args.push("COUNT", String(options.COUNT));
		}
		if (options?.BLOCK !== undefined) {
			args.push("BLOCK", String(options.BLOCK));
		}
		args.push("STREAMS");
		for (const s of streams) {
			args.push(s.key);
		}
		for (const s of streams) {
			args.push(s.id);
		}
		const res = await client.customCommand(args);
		if (!res) return null;

		const rawArr = res as any[];
		if (Array.isArray(res) && rawArr.length > 0 && rawArr[0]?.name && Array.isArray(rawArr[0]?.messages)) {
			return res as any;
		}

		if (Array.isArray(res)) {
			return res.map((streamItem: any) => {
				if (Array.isArray(streamItem) && streamItem.length >= 2) {
					return {
						name: String(streamItem[0]),
						messages: parseStreamEntries(streamItem[1]),
					};
				}
				if (streamItem?.key !== undefined && streamItem?.value !== undefined) {
					return {
						name: String(streamItem.key),
						messages: parseStreamEntries(streamItem.value),
					};
				}
				if (streamItem?.name && streamItem?.messages) {
					return {
						name: String(streamItem.name),
						messages: parseStreamEntries(streamItem.messages),
					};
				}
				return {
					name: "unknown",
					messages: [],
				};
			});
		}

		if (res instanceof Map) {
			return Array.from(res.entries()).map(([streamName, entries]) => ({
				name: String(streamName),
				messages: parseStreamEntries(entries),
			}));
		}

		if (typeof res === "object") {
			return Object.entries(res).map(([streamName, entries]) => ({
				name: streamName,
				messages: parseStreamEntries(entries),
			}));
		}

		return null;
	}

	public async xread(
		streams: Array<{ key: string; id: string }>,
		options?: { COUNT?: number; BLOCK?: number },
	) {
		return this.xRead(streams, options);
	}

	public async zAdd(
		key: string,
		memberOrMembers: { score: number; value: string } | Array<{ score: number; value: string }>,
	): Promise<number> {
		const client = await this.getRawClient();
		const items = Array.isArray(memberOrMembers) ? memberOrMembers : [memberOrMembers];
		if (items.length === 0) return 0;
		const args = ["ZADD", key];
		for (const item of items) {
			args.push(String(item.score), item.value);
		}
		const res = await client.customCommand(args);
		return Number(res ?? 0);
	}

	public async zadd(
		key: string,
		memberOrMembers: { score: number; value: string } | Array<{ score: number; value: string }>,
	): Promise<number> {
		return this.zAdd(key, memberOrMembers);
	}

	public async zRangeByScore(key: string, min: number | string, max: number | string): Promise<string[]> {
		const client = await this.getRawClient();
		const res = await client.customCommand(["ZRANGEBYSCORE", key, String(min), String(max)]);
		if (!res) return [];
		const rawArr = Array.isArray(res) ? res : res instanceof Set ? Array.from(res) : [];
		return rawArr.map((item: any) => {
			if (typeof item === "string") return item;
			if (Buffer.isBuffer(item)) return item.toString("utf8");
			if (item && typeof item === "object") {
				if (item.value !== undefined) return typeof item.value === "string" ? item.value : String(item.value);
				if (item.member !== undefined) return typeof item.member === "string" ? item.member : String(item.member);
				if (item.key !== undefined) return typeof item.key === "string" ? item.key : String(item.key);
			}
			return String(item);
		});
	}

	public async zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]> {
		return this.zRangeByScore(key, min, max);
	}

	public async zRem(key: string, ...members: (string | string[])[]): Promise<number> {
		const client = await this.getRawClient();
		const flatMembers = members.flat();
		if (flatMembers.length === 0) return 0;
		const res = await client.zrem(key, flatMembers);
		return Number(res ?? 0);
	}

	public async zrem(key: string, ...members: (string | string[])[]): Promise<number> {
		return this.zRem(key, ...members);
	}

	public multi(): ValkeyMultiAdapter {
		return new ValkeyMultiAdapter(this);
	}

	public async ping(): Promise<string> {
		const client = await this.getRawClient();
		const res = await client.customCommand(["PING"]);
		return String(res ?? "PONG");
	}

	public async customCommand(args: string[]): Promise<any> {
		const client = await this.getRawClient();
		return client.customCommand(args);
	}
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

function logValkeyPoolError(poolName: string, err: unknown) {
	if (isCircuitBreakerError(err)) {
		logger.warn(`[Valkey:${poolName}] Coupe-circuit actif (Circuit Breaker OUVERT)`);
	} else if (isTimeoutError(err)) {
		logger.warn(`[Valkey:${poolName}] Délai d'attente dépassé (TimeoutError)`);
	} else if (isConnectionError(err)) {
		logger.error(`[Valkey:${poolName}] Rupture de connexion réseau (ConnectionError)`, err);
	} else if (isValkeyError(err)) {
		logger.error(`[Valkey:${poolName}] Erreur Valkey [${err.name}]: ${err.message}`);
	} else {
		logger.error(`[Valkey:${poolName}] Erreur non typée`, err);
	}
}

// Client flux (RESP2) dédié à la lecture des streams Valkey (pas de cache client sur les streams)
const rawStream = new ValkeyClientAdapter(
	createGlideConfig({ protocol: ProtocolVersion.RESP2, enableClientSideCache: false }),
	"Stream",
);
rawStream.on("error", (err: unknown) => logValkeyPoolError("Stream", err));
export const valkeyStream = wrapWithLogging(rawStream, "Stream");

// Client de lecture (RESP3) avec Client-Side Caching activé pour les données utilisateur et configs
const rawReader = new ValkeyClientAdapter(
	createGlideConfig({ protocol: ProtocolVersion.RESP3, enableClientSideCache: true }),
	"Reader",
);
rawReader.on("error", (err: unknown) => logValkeyPoolError("Reader", err));
export const valkeyReader = wrapWithLogging(rawReader, "Reader");

// Client d'écriture (RESP3) pour les signaux d'annulation, files d'attente et état
const rawWriter = new ValkeyClientAdapter(
	createGlideConfig({ protocol: ProtocolVersion.RESP3, enableClientSideCache: false }),
	"Writer",
);
rawWriter.on("error", (err: unknown) => logValkeyPoolError("Writer", err));
export const valkeyWriter = wrapWithLogging(rawWriter, "Writer");

/**
 * Initialise toutes les connexions Valkey en parallèle.
 */
export async function connectValkeyClients(): Promise<void> {
	await Promise.all([valkeyStream.connect(), valkeyReader.connect(), valkeyWriter.connect()]);
	logger.info("Tous les pools Valkey sont connectés.");
}

// Alias de rétrocompatibilité Redis
export const redisStream = valkeyStream;
export const redisReader = valkeyReader;
export const redisWriter = valkeyWriter;
export const connectRedisClients = connectValkeyClients;
