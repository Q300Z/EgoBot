import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify, { transformAssetUrls } from "vite-plugin-vuetify";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendTarget = process.env.VITE_API_PROXY_TARGET || process.env.BACKEND_URL || "http://localhost:8000";

export default defineConfig(({ mode }) => {
  // S'assurer que le mode de production n'est jamais écrasé par NODE_ENV=development du .env racine
  if (mode === "production") {
    process.env.NODE_ENV = "production";
  }

  return {
    envDir: path.resolve(__dirname, "../../"),
    envPrefix: ["VITE_"],
    plugins: [
      vue({
        template: { transformAssetUrls },
      }),
      vuetify({
        autoImport: true,
      }),
    ],
  server: {
    port: 3000,
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
      interval: 100,
    },
    hmr: {
      clientPort: 3000,
    },
    // Le navigateur n'est pas forcément sur la même machine que l'API :
    // en Codespaces ou en VM, il tourne chez l'utilisateur tandis que l'API
    // écoute dans le conteneur. Le front émet donc des requêtes relatives, et
    // c'est le serveur Vite — lui, bien à côté de l'API — qui les relaie.
    //
    // Effet secondaire utile : tout passe par la même origine, donc aucune
    // question de CORS ni de port supplémentaire à exposer.
    proxy: {
      "/api": { target: backendTarget, changeOrigin: true },
      "/health": { target: backendTarget, changeOrigin: true },
      // Le flux SSE doit rester ouvert : pas de tampon, pas de fermeture
      // anticipée, sinon l'affichage au fil de l'eau ne fonctionne plus.
      "/sse": { target: backendTarget, changeOrigin: true, ws: false },
    },
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/mermaid") || id.includes("node_modules/d3") || id.includes("node_modules/dagre")) {
            return "mermaid";
          }
          if (id.includes("node_modules/chart.js") || id.includes("node_modules/vue-chartjs")) {
            return "chartjs";
          }
          if (id.includes("node_modules/vuetify")) {
            return "vuetify";
          }
          if (id.includes("node_modules/vue/") || id.includes("node_modules/vue-router/") || id.includes("node_modules/pinia/")) {
            return "vue-core";
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    server: {
      deps: {
        inline: ["vuetify"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,vue}"],
      exclude: [
        "src/main.ts",
        "src/env.d.ts",
        "src/**/*.d.ts",
        "src/test/**",
        "src/**/__tests__/**",
      ],
    },
  },
  };
});


