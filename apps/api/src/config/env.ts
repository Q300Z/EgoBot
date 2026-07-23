import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

export const EnvSchema = z.object({
  PORT: z.coerce.number().default(8000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  VALKEY_URL: z.string().default(process.env.REDIS_URL || "redis://localhost:6379"),
  JWT_SECRET: z.string().default("super_secret_jwt_key_12345"),
  WORKER_STATUS_INTERVAL_MS: z.coerce.number().default(5000),
  CORS_ORIGIN: z.string().default(process.env.CORS_ORIGIN || "*"),
});

export const env = EnvSchema.parse(process.env);
