import Redis from "ioredis";
import { env } from "./env.js";

// Client Valkey 100% compatible RESP protocol
export const valkeyStream = new Redis(env.VALKEY_URL);
export const valkeyReader = new Redis(env.VALKEY_URL);
export const valkeyWriter = new Redis(env.VALKEY_URL);
