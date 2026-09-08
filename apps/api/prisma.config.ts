import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnv = path.resolve(__dirname, "../../.env");

if (fs.existsSync(rootEnv) && typeof process.loadEnvFile === "function") {
	try {
		process.loadEnvFile(rootEnv);
	} catch {
		// Ignore si déjà chargé ou inaccessible
	}
}

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: process.env["API_DATABASE_URL"] || process.env["DATABASE_URL"] || "file:./dev.db",
	},
});
