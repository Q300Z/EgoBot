import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../prisma/generated/prisma/client.js";

export function createPrismaClient(
  connectionString = process.env.DATABASE_URL || "file:./logistics.db",
): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: connectionString }),
  });
}

export type LogisticsPrismaClient = PrismaClient;
