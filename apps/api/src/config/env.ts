import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

/**
 * Préfixe des clés Valkey (`jobs:queue:<env>:<model>`, `jobs:sse:<env>:<jobId>`).
 *
 * Cette valeur DOIT être identique côté API et côté worker, sinon l'API publie
 * dans une file que personne ne consomme. Le worker la dérive de
 * `process.env.NODE_ENV || "dev"` (apps/worker/src/index.ts, puis
 * WorkerApplication) : on reproduit exactement la même expression ici.
 *
 * Ne pas utiliser `env.NODE_ENV` ci-dessous : son schéma applique la valeur par
 * défaut "development", alors que le worker retombe sur "dev" quand la variable
 * est absente. Les deux préfixes divergeraient en lancement local.
 */
export const STREAM_ENV = process.env.NODE_ENV || "dev";

export const EnvSchema = z.object({
  PORT: z.coerce.number().default(8000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  VALKEY_URL: z.string().default(process.env.REDIS_URL || "redis://localhost:6379"),

  // En production, aucune valeur par défaut : démarrer avec un secret connu de
  // tous permettrait de forger n'importe quel jeton, donc d'usurper un compte
  // administrateur. Hors production, une valeur de repli garde le confort de dev.
  JWT_SECRET: isProduction
    ? z
        .string({ message: "JWT_SECRET est obligatoire en production" })
        .min(32, "JWT_SECRET doit faire au moins 32 caractères en production")
    : z.string().default("dev_only_insecure_jwt_secret_change_me"),

  WORKER_STATUS_INTERVAL_MS: z.coerce.number().default(5000),
  CORS_ORIGIN: z.string().default(process.env.CORS_ORIGIN || "*"),
});

function parseEnv() {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")} : ${issue.message}`)
      .join("\n");
    throw new Error(`Configuration d'environnement invalide :\n${details}`);
  }

  if (isProduction && result.data.CORS_ORIGIN === "*") {
    console.warn(
      "[env] CORS_ORIGIN vaut \"*\" en production : toute origine est autorisée. " +
        "Renseigner le domaine du front, par exemple https://egobot.example.com",
    );
  }

  return result.data;
}

export const env = parseEnv();
