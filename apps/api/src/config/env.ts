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

const rawEnv = {
	...process.env,
	SECRET_KEY: process.env.SECRET_KEY || process.env.JWT_SECRET || "change_me_with_a_long_random_secret",
};

const INSECURE_DEFAULT_SECRETS = new Set([
	"change_me_with_a_long_random_secret",
	"change_me_in_production_jwt_secret_98765",
	"super_secret_jwt_key_12345",
]);

const envSchema = z
	.object({
		NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
		PORT: z.coerce.number().default(8000),
		DATABASE_URL: z.string().default("file:./prod.db"),
		PRISMA_DISABLED: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
		SECRET_KEY: z.string().default("change_me_with_a_long_random_secret"),
		CORS_ORIGIN: z.string().default("*"),
		CACHE_HOSTNAME: z.string().default("localhost"),
		CACHE_PORT: z.coerce.number().default(6379),
		CACHE_PASSWORD: z.string().default(""),
		CACHE_DB_NAME: z.coerce.number().default(0),
		CACHE_EXPIRE: z.coerce.number().default(3600),
		VALKEY_URL: z.string().optional(),
		REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
		VALKEY_ENABLE_CLIENT_CACHE: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(true),
		VALKEY_CACHE_SIZE_KB: z.coerce.number().default(1024),
		VALKEY_CACHE_TTL_MS: z.coerce.number().default(60000),
		VALKEY_ENABLE_CIRCUIT_BREAKER: z.preprocess(
			(val) => (val === undefined ? undefined : val === "true" || val === true),
			z.boolean().optional(),
		),
	})
	.superRefine((data, ctx) => {
		if (data.NODE_ENV === "production") {
			if (!data.SECRET_KEY || data.SECRET_KEY.length < 32) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["SECRET_KEY"],
					message: "En production, SECRET_KEY (ou JWT_SECRET) doit comporter au moins 32 caractères.",
				});
			}
			if (INSECURE_DEFAULT_SECRETS.has(data.SECRET_KEY)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["SECRET_KEY"],
					message: "En production, SECRET_KEY ne doit pas utiliser une valeur par défaut publique.",
				});
			}
			if (data.CORS_ORIGIN === "*") {
				console.warn("⚠️ Attention de sécurité : CORS_ORIGIN est configuré sur '*' en production.");
			}
		}
	});

// Validation of the default UTF-8 encoding
if (
	process.env.LANG &&
	!process.env.LANG.toLowerCase().includes("utf-8") &&
	!process.env.LANG.toLowerCase().includes("utf8")
) {
	console.warn(`⚠️ Attention: L'environnement système (LANG=${process.env.LANG}) ne semble pas configuré en UTF-8.`);
}

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
	console.error("❌ Variables d'environnement invalides :", parsed.error.format());
	process.exit(1);
}

export const env = parsed.data;
