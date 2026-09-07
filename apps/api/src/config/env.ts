import * as path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chargement natif des variables d'environnement (Node.js 20.6+)
try {
	const envPath = path.resolve(__dirname, "../../.env");
	if (typeof process.loadEnvFile === "function") {
		process.loadEnvFile(envPath);
	}
} catch {
	// Ignorer si le fichier .env est absent (ex: variables injectées par l'environnement ou Docker)
}

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().default(8000),
	DATABASE_URL: z.string().default("file:./prod.db"),
	PRISMA_DISABLED: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
	SECRET_KEY: z.string().default("change_me_with_a_long_random_secret"),
	CACHE_HOSTNAME: z.string().default("localhost"),
	CACHE_PORT: z.coerce.number().default(6379),
	CACHE_PASSWORD: z.string().default(""),
	CACHE_DB_NAME: z.coerce.number().default(0),
	CACHE_EXPIRE: z.coerce.number().default(3600),
	WORKER_STATUS_INTERVAL_MS: z.coerce.number().default(5000),
	REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
});

// Validation of the default UTF-8 encoding
if (
	process.env.LANG &&
	!process.env.LANG.toLowerCase().includes("utf-8") &&
	!process.env.LANG.toLowerCase().includes("utf8")
) {
	console.warn(`⚠️ Attention: L'environnement système (LANG=${process.env.LANG}) ne semble pas configuré en UTF-8.`);
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("❌ Variables d'environnement invalides :", parsed.error.format());
	process.exit(1);
}

export const env = parsed.data;
