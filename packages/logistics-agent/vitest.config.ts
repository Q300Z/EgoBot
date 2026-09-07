import { defineConfig } from "vitest/config";

// Config locale : permet `pnpm --filter @egobot/logistics-agent test`.
// Sans elle, Vitest remonte à la config racine dont le glob `packages/**`
// ne matche rien une fois exécuté depuis ce dossier.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "prisma/generated/**",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
    },
  },
});
