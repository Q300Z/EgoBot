# 💻 `@egobot/web` (Client Web Vue 3 + Backoffice)

Application Single Page moderne construite avec **Vue 3**, **Vite** et **Pinia**, incluant une interface de Chat dynamique, un Backoffice d'Administration et un mécanisme d'**Auto-Fallback SSE ➔ HTTP Batch Polling (6s)**.

---

## 🏗️ Structure du Projet

```text
apps/web/
├── src/
│   ├── components/      # Composants réutilisables (ChatWindow, UserTable)
│   ├── stores/          # Stores Pinia (auth.ts, chat.ts, backoffice.ts)
│   ├── views/           # Vues principales (ChatView.vue, BackofficeView.vue)
│   ├── App.vue          # Composant Racine
│   ├── main.ts          # Point d'entrée Vite
│   └── env.d.ts         # Typages Vue
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## 🔄 Mécanisme d'Auto-Fallback SSE ➔ HTTP Batch Polling

Dans `src/stores/chat.ts` :
1. Lors de l'envoi d'un message, le store ouvre un flux SSE via `@egobot/sdk/client`.
2. Un timer d'inactivité de **6 secondes** est armé.
3. Si aucun jeton SSE n'est reçu dans les 6s (par exemple à cause d'un proxy/firewall entreprise bloquant l'EventSource), le store ferme l'EventSource et active automatiquement un **polling HTTP Batch (`loadConversation`) toutes les 2 secondes** jusqu'à réception du message complet.

---

## 🛠️ How-To : Ajouter une Page, un Composant ou un Store Pinia

### 1. Ajouter un nouveau Store Pinia (`src/stores/articles.ts`)
```typescript
import { defineStore } from "pinia";
import { ref } from "vue";
import { useAuthStore } from "./auth";

export const useArticlesStore = defineStore("articles", () => {
  const authStore = useAuthStore();
  const articles = ref([]);

  async function fetchArticles() {
    articles.value = await authStore.sdk.getArticles();
  }

  return { articles, fetchArticles };
});
```

### 2. Ajouter un Composant Vue (`src/components/ArticleCard.vue`)
```vue
<template>
  <div class="article-card">
    <h3>{{ title }}</h3>
    <p>{{ content }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; content: string }>();
</script>
```

---

## 🚀 Lancement Individuel

```bash
pnpm --filter web dev
```
