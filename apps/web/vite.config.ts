import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Cible du proxy vers l'API. En natif, l'API écoute sur localhost ; sous Docker
// Compose, le serveur Vite tourne dans le conteneur `web` et doit joindre le
// conteneur `api` par son nom de service réseau (défini via API_PROXY_TARGET).
const apiTarget = process.env.API_PROXY_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    // Le navigateur n'est pas forcément sur la même machine que l'API :
    // en Codespaces ou en VM, il tourne chez l'utilisateur tandis que l'API
    // écoute dans le conteneur. Le front émet donc des requêtes relatives, et
    // c'est le serveur Vite — lui, bien à côté de l'API — qui les relaie.
    //
    // Effet secondaire utile : tout passe par la même origine, donc aucune
    // question de CORS ni de port supplémentaire à exposer.
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/health": { target: apiTarget, changeOrigin: true },
      // Le flux SSE doit rester ouvert : pas de tampon, pas de fermeture
      // anticipée, sinon l'affichage au fil de l'eau ne fonctionne plus.
      "/sse": { target: apiTarget, changeOrigin: true, ws: false },
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
});

