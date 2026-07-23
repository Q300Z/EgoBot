import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";

const sqlite = new Database("prisma/prod.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");

const adapter = new PrismaBetterSqlite3(sqlite as any);
export const prisma = new PrismaClient({ adapter });
