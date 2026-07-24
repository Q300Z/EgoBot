import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "packages/shared-types/src/**/*.ts",
        "packages/sdk/src/**/*.ts"
      ],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/*.spec.ts"
      ],
    },
  },
});
