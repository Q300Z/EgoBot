import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";

const cwd = process.cwd();
const apiDir = cwd.endsWith("api") ? cwd : path.join(cwd, "apps/api");
const defaultDbPath = path.resolve(apiDir, "prisma/dev.db");

const dbPath = process.env.DATABASE_URL || defaultDbPath;
const adapter = new PrismaBetterSqlite3({ url: dbPath });

export const prisma = new PrismaClient({ adapter });
