# 📦 `@my-llm/shared-types`

Ce package contient l'ensemble des **contrats de données, schémas Zod et typages TypeScript universels** partagés entre l'API Express, le SDK, le Worker TS et le Client Web Vue 3.

---

## 🏗️ Structure du Package

```text
packages/shared-types/
├── src/
│   ├── user.ts          # Schemas DTO User & Authentification (Email, Password, Role)
│   ├── conversation.ts  # Schemas DTO Conversation & Messages
│   ├── job.ts           # Schemas DTO Job, Statuts & Télémétrie
│   ├── sse.ts           # Schemas DTO des événements Server-Sent Events (token, stats)
│   └── index.ts         # Export centralisé
├── package.json
└── tsconfig.json
```

---

## 🛠️ How-To : Ajouter un Nouvel Objet / Schéma Zod

Pour ajouter une nouvelle entité ou un nouvel objet (ex: `Article`) :

1. **Créer le fichier de schéma** (`src/article.ts`) :
   ```typescript
   import { z } from "zod";

   export const ArticleSchema = z.object({
     id: z.string().uuid(),
     title: z.string().min(3),
     content: z.string(),
     user_id: z.string().uuid(),
     created_at: z.string().datetime(),
     updated_at: z.string().datetime(),
   });
   export type Article = z.infer<typeof ArticleSchema>;
   ```

2. **Exporter le nouveau schéma** dans `src/index.ts` :
   ```typescript
   export * from "./article.js";
   ```

3. **Compiler le package** :
   ```bash
   pnpm --filter @my-llm/shared-types build
   ```
