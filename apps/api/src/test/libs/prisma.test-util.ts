import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import fs from "node:fs";

const TEST_DB_FILE = "test.db";
const TEST_DB_URL = `file:./${TEST_DB_FILE}`;

export async function createTestPrismaClient(): Promise<PrismaClient> {
	// Sync schema to test.db
	console.log(`Synchronizing test database schema to ${TEST_DB_URL}...`);
	execSync(`npx prisma db push --accept-data-loss --force-reset`, {
		env: {
			...process.env,
			DATABASE_URL: TEST_DB_URL,
			PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "Yes",
		},
		stdio: "inherit",
	});

	const adapter = new PrismaBetterSqlite3({ url: TEST_DB_URL });

	return new PrismaClient({ adapter });
}

export function cleanupTestDb() {
	if (fs.existsSync(TEST_DB_FILE)) {
		fs.unlinkSync(TEST_DB_FILE);
	}
}
