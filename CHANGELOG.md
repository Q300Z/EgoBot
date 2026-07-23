# 📝 Changelog Global (`scaffold-monorepo`)

Toutes les modifications notables apportées à ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et ce projet adhère à la [Gestion Sémantique de Version](https://semver.org/lang/fr/).

---

## [1.0.0] - 2026-07-22

### ✨ Initial Release
- **Architecture 100% TypeScript** (`pnpm workspaces` + `Turborepo 2.0`).
- **Support Valkey 8** (`valkey/valkey:8-alpine`) pour les files réactives Valkey Streams.
- **Packages Partagés** :
  - `@my-llm/shared-types` : Schémas Zod universels (`user`, `conversation`, `job`, `sse`).
  - `@my-llm/sdk` : Exports Subpath stricts (`/client` pour Web REST/SSE & `/worker` pour Worker TS).
- **Backend Express (`apps/api`)** :
  - Base de données Prisma SQLite en mode WAL.
  - EventBus local Node.js et diffusion SSE multi-sessions.
  - Authentification simplifiée par Email/Password (hachage `bcryptjs` + JWT).
  - Endpoints d'administration Backoffice et monitoring Live SSE.
- **Worker TS (`apps/worker`)** :
  - Worker réactif `WorkerApplication` consommant Valkey Streams (`XREADGROUP`/`XACK`).
  - Détections d'annulation (`ctx.checkCancellation()`) et signaux de présence Heartbeat.
- **Client Web Vue 3 (`apps/web`)** :
  - Interface de Chat dynamique (Pinia Store).
  - **Moteur de Fallback Automatique SSE ➔ HTTP Batch Polling (6s)**.
  - Interface de Backoffice d'Administration.
