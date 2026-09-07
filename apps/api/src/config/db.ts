import * as path from "path";
import { fileURLToPath } from "url";
import { env } from "./env";
import { LoggerFactory } from "./logger";
import type { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = LoggerFactory.getLogger("Prisma");

function resolveSqliteUrl(url: string): string {
	if (url.startsWith("file:")) {
		const filePath = url.replace(/^file:/, "");
		if (!path.isAbsolute(filePath)) {
			// __dirname est src/config -> apiRootDir est à 2 niveaux au-dessus (../..)
			const apiRootDir = path.resolve(__dirname, "../..");
			return `file:${path.resolve(apiRootDir, filePath)}`;
		}
	}
	return url;
}

const connectionString = resolveSqliteUrl(env.DATABASE_URL);
const prismaDisabled = env.PRISMA_DISABLED;

/**
 * Crée un proxy de secours (fallback) pour simuler Prisma si le client natif est indisponible.
 */
const createUnavailablePrismaProxy = (): PrismaClient => {
	const handler: ProxyHandler<() => unknown> = {
		get: (_target, property) => {
			if (property === "then") {
				return undefined;
			}
			return new Proxy(() => undefined, handler);
		},
		apply: () => {
			throw new Error("Le service de base de données (Prisma) est indisponible. Vérifiez les binaires SQLite.");
		},
	};

	return new Proxy(() => undefined, handler) as unknown as PrismaClient;
};

/**
 * Initialise le client Prisma de manière asynchrone et gère les erreurs de liaison native.
 */
const initializePrisma = async (): Promise<PrismaClient> => {
	if (prismaDisabled) {
		return createUnavailablePrismaProxy();
	}

	try {
		// Chargement dynamique pour éviter les erreurs de top-level import
		const [{ PrismaBetterSqlite3 }, { PrismaClient }] = await Promise.all([
			import("@prisma/adapter-better-sqlite3"),
			import("@prisma/client"),
		]);

		const adapter = new PrismaBetterSqlite3({ url: connectionString });
		const client = new PrismaClient({ adapter });

		// Configuration de SQLite en mode WAL
		try {
			await client.$executeRawUnsafe("PRAGMA journal_mode=WAL;");
			await client.$executeRawUnsafe("PRAGMA synchronous=NORMAL;");
			await client.$executeRawUnsafe("PRAGMA cache_size=5000;");
			await client.$executeRawUnsafe("PRAGMA temp_store=MEMORY;");
			await client.$executeRawUnsafe("PRAGMA automatic_index=ON;");
			logger.info("SQLite configuré avec succès en mode WAL et synchronous=NORMAL");
		} catch (err) {
			logger.error("Échec de la configuration PRAGMA de SQLite:", err);
		}

		// Gestion de l'extinction propre du moteur SQL
		const cleanup = async () => {
			logger.info("Déconnexion de la base de données avant fermeture...");
			await (client as unknown as PrismaClient).$disconnect();
		};

		process.on("SIGINT", cleanup);
		process.on("SIGTERM", cleanup);

		return client;
	} catch (error) {
		logger.warn("Échec de l'initialisation native, basculement sur le proxy de secours.", error);
		return createUnavailablePrismaProxy();
	}
};

/**
 * Instance unique du client Prisma pour toute l'application.
 */
const prisma = await initializePrisma();

export { prisma };
