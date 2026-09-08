import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../prisma/generated/prisma/client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRootDir = path.resolve(__dirname, "../..");

export function resolveLogisticsDbUrl(url?: string): string {
  const target = url || process.env.LOGISTICS_DATABASE_URL || process.env.DATABASE_URL || "file:./logistics.db";
  if (target.startsWith("file:")) {
    const rawPath = target.replace(/^file:/, "");
    if (!path.isAbsolute(rawPath)) {
      return `file:${path.resolve(packageRootDir, rawPath)}`;
    }
  }
  return target;
}

export function createPrismaClient(
  connectionString?: string,
): PrismaClient {
  const resolvedUrl = resolveLogisticsDbUrl(connectionString);
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: resolvedUrl }),
  });
}

export type LogisticsPrismaClient = PrismaClient;

