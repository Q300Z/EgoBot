import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
	{
		ignores: [
			"dist/**",
			"build/**",
			"prisma/generated/**",
			"coverage/**",
			"**/*.html",
			"**/*.json",
			"node_modules/**",
			"package-lock.json",
			"pnpm-lock.yaml",
			".vscode/**",
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	prettierConfig,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				ecmaVersion: "latest",
				sourceType: "module",
			},
			globals: {
				...globals.node,
				...globals.es2026,
			},
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
			"@typescript-eslint/no-unsafe-function-type": "off",
			"no-empty": ["error", { allowEmptyCatch: true }],
		},
	},
);
