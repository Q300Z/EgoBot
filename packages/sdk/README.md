# 🛠️ `@egobot/sdk`

Le SDK universel TypeScript fournit l'ensemble des abstractions clientes REST / SSE pour le Web et le runtime d'exécution pour les Workers.

---

## 🔒 Subpath Exports Stricts

Afin d'éviter l'inclusion de dépendances natifs Node.js (`ioredis` / Valkey) dans le navigateur client Web, le SDK est scindé en deux points d'entrée stricts dans `package.json` :

* **`@egobot/sdk/client`** : Destiné au Frontend Vue 3 (Axios Client REST + Client EventSource SSE Auto-healing & Fallback).
* **`@egobot/sdk/worker`** : Destiné au Worker Node.js (Moteur `WorkerApplication`, Valkey Streams Consumer Group, Context).

---

## 🏗️ Structure du Package

```text
packages/sdk/
├── src/
│   ├── client/
│   │   ├── event-client.ts   # Helper EventSource avec support Last-Event-ID
│   │   └── index.ts          # Classe EgobotClientSDK (Auth, Conversations, Admin)
│   └── worker/
│       ├── context.ts        # WorkerTaskContext (sendToken, checkCancellation, deferJob)
│       ├── application.ts    # Moteur WorkerApplication (Valkey Streams XREADGROUP/XACK)
│       └── index.ts          # Export centralisé worker
├── package.json
└── tsconfig.json
```

---

## 🛠️ How-To : Faire Évoluer le SDK

### 1. Ajouter une Méthode au Client Web Client REST (`src/client/index.ts`)

Pour exposer un nouvel endpoint API au client Web (ex: `deleteUser` ou `getArticles`) :

```typescript
export class EgobotClientSDK {
  // ...
  async getArticles(): Promise<Article[]> {
    const res = await this.api.get("/api/v1/articles");
    return res.data.data;
  }
}
```

### 2. Étendre le Context Worker (`src/worker/context.ts`)

Pour ajouter une nouvelle capacité au Worker (ex: envoyer de la télémétrie sur l'utilisation mémoire) :

```typescript
export interface WorkerTaskContext {
  jobId: string;
  conversationId: string;
  sendToken: (chunk: string) => Promise<void>;
  sendMetrics: (metrics: any) => Promise<void>; // Nouvelle méthode
}
```

### 3. Compiler le SDK

```bash
pnpm --filter @my-llm/sdk build
```
