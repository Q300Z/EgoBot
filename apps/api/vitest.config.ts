import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/test/**/*.test.ts"],
		fileParallelism: false,
		maxWorkers: 1,
		testTimeout: 60000,
		hookTimeout: 60000,
		alias: {
			"@agelid/shared-models": path.resolve(__dirname, "../packages/shared-models/src"),
		},
	},
});
