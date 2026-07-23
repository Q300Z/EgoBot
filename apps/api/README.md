# ⚡ `@my-llm/api` (Backend Express API)

Application backend Express 100% TypeScript gérant l'authentification (JWT), l'accès BDD (Prisma SQLite WAL), l'EventBus événementiel local et l'orchestration Valkey Streams.

---

## 🏗️ Architecture des Fichiers

```text
apps/api/
├── prisma/
│   └── schema.prisma        # Schéma BDD Prisma SQLite
├── src/
│   ├── config/              # env.ts, db.ts, valkey.ts, logger.ts
│   ├── events/              # EventBus local
│   ├── repositories/        # Abstraction BDD Prisma (UserRepository, JobRepository, etc.)
│   ├── services/            # Logique métier (JobService, SseService, TacheService)
│   ├── controllers/         # Contrôleurs HTTP (AuthController, MessageController, AdminController)
│   ├── middlewares/         # authMiddleware, errorMiddleware
│   ├── app.ts               # Configuration Express & Routage
│   └── index.ts             # Démarrage du serveur et des services background
```

---

## 🛠️ How-To : Ajouter une Fonctionnalité Métier Complète (Ex: `Article`)

Pour ajouter une entité `Article` et ses endpoints API :

### 1. Ajouter le Modèle Prisma BDD (`prisma/schema.prisma`)
```prisma
model Article {
  id         String   @id @default(uuid())
  title      String
  content    String
  user_id    String
  user       User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
}
```
Exécuter la migration BDD : `pnpm --filter api exec prisma migrate dev`.

### 2. Créer le Repository (`src/repositories/article.repository.ts`)
```typescript
import { prisma } from "../config/db.js";

export class ArticleRepository {
  static async create(data: { title: string; content: string; user_id: string }) {
    return prisma.article.create({ data });
  }

  static async findByUserId(userId: string) {
    return prisma.article.findMany({ where: { user_id: userId } });
  }
}
```

### 3. Créer le Service Métier (`src/services/article.service.ts`)
```typescript
import { ArticleRepository } from "../repositories/article.repository.js";
import { eventBus } from "../events/eventBus.js";

export class ArticleService {
  static async createArticle(userId: string, title: string, content: string) {
    const article = await ArticleRepository.create({ title, content, user_id: userId });
    eventBus.publish("article.created", { articleId: article.id });
    return article;
  }
}
```

### 4. Créer le Contrôleur HTTP (`src/controllers/article.controller.ts`)
```typescript
import type { Response } from "express";
import { ArticleService } from "../services/article.service.js";
import type { AuthRequest } from "../middlewares/auth.middleware.js";

export class ArticleController {
  static async createArticle(req: AuthRequest, res: Response) {
    const { title, content } = req.body;
    const article = await ArticleService.createArticle(req.user!.id, title, content);
    return res.status(201).json({ success: true, data: article });
  }
}
```

### 5. Brancher la Route API dans `src/app.ts`
```typescript
import { ArticleController } from "./controllers/article.controller.js";

app.post("/api/v1/articles", authMiddleware as any, ArticleController.createArticle);
```

---

## 🚀 Lancement Individuel

```bash
pnpm --filter api dev
```
