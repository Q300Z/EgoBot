# ⚙️ `@my-llm/worker` (Pure TypeScript Worker)

Worker d'inférence autonome réécrit en Pure TypeScript s'appuyant sur le SDK `@my-llm/sdk/worker`.

---

## 🏗️ Fonctionnement du Worker

1. **Consumer Group Valkey Streams** : Le worker s'enregistre auprès de Valkey Streams sous un groupe de consommateurs unique via `XREADGROUP`.
2. **Streaming Réactif de Jetons** : Pour chaque token produit par le handler du modèle, `ctx.sendToken(chunk)` est appelé pour publier l'événement sur Valkey Stream `jobs:sse:dev:<jobId>`.
3. **Heartbeat & Signal d'Interruption** : Le worker envoie sa présence toutes les 5s et vérifie via `ctx.checkCancellation()` si l'utilisateur a annulé la requête en cours.

---

## 🛠️ How-To : Déclarer un Nouveau Modèle / Handler de Tâche

Pour enregistrer un nouveau traitement dans le worker (ex: modèle `ANALYTICS` ou `TRANSLATION`) :

Ouvrir `apps/worker/src/index.ts` :

```typescript
import { WorkerApplication } from "@my-llm/sdk/worker";

const worker = new WorkerApplication({
  workerId: "ts-worker-1",
  models: ["CHATBOT", "ANALYTICS", "TRANSLATION"],
  valkeyUrl: process.env.VALKEY_URL || "redis://localhost:6379",
});

// Enregistrement du nouveau handler
worker.registerTask("TRANSLATION", async (payload, ctx) => {
  console.log(`[Worker TS] Traduction du prompt : "${payload.prompt}"`);

  const tokens = ["Hello", " ", "world", " !"];
  for (const token of tokens) {
    if (await ctx.checkCancellation()) {
      return; // Annulation précoce si demandé
    }
    await ctx.sendToken(token);
    await new Promise((r) => setTimeout(r, 100));
  }
});

worker.start();
```

---

## 🚀 Lancement Individuel

```bash
pnpm --filter worker dev
```
