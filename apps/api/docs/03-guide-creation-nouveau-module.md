# 03. Guide : Créer un Nouveau Module

Ce guide pas-à-pas présente la création de deux types de modules :

1. **Un Module de Domaine Métier** (ex: `notification`) avec persistance et commandes.
2. **Un Module Connecteur Transparent (Mode Passthrough)** (ex: `gateway`) interfaçant un worker externe avec webhook callback.

---

## 🏗️ Cas 1 : Créer un Module de Domaine Métier

### Étape 1 : Créer l'Arborescence

```bash
mkdir -p src/modules/notification
```

---

### Étape 2 : Définir les Schémas (`notification.schema.ts`)

```typescript
import { z } from "zod";

export const NotificationTypeSchema = z.enum(["EMAIL", "SMS", "IN_APP"]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const SendNotificationInputSchema = z.object({
	userId: z.string().min(1),
	title: z.string().min(1).max(100),
	content: z.string().min(1),
	type: NotificationTypeSchema.default("IN_APP"),
});

export type SendNotificationInput = z.infer<typeof SendNotificationInputSchema>;

export const NotificationResponseSchema = z.object({
	id: z.string().uuid(),
	status: z.enum(["SENT", "FAILED"]),
	createdAt: z.date(),
});

export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;
```

---

### Étape 3 : Déclarer les Commandes et Événements

#### Commandes (`notification.commands.ts`) :

```typescript
import { defineCommand } from "../../core/bus";
import { SendNotificationInputSchema, NotificationResponseSchema } from "./notification.schema";

export const NotificationCommands = {
	send: defineCommand("notification.send", SendNotificationInputSchema, NotificationResponseSchema),
};
```

#### Événements (`notification.events.ts`) :

```typescript
import { z } from "zod";
import { defineEvent } from "../../core/bus";

export const NotificationEvents = {
	sent: defineEvent(
		"notification.sent",
		z.object({
			notificationId: z.string().uuid(),
			userId: z.string(),
		}),
	),
};
```

---

### Étape 4 : Créer le Repository (`NotificationRepository.ts`)

```typescript
import { prisma } from "../../config/database";
import type { SendNotificationInput, NotificationResponse } from "./notification.schema";

export class NotificationRepository {
	public static async save(input: SendNotificationInput): Promise<NotificationResponse> {
		const notificationId = crypto.randomUUID();
		// Sauvegarde en base SQLite WAL ou Redis
		return {
			id: notificationId,
			status: "SENT",
			createdAt: new Date(),
		};
	}
}
```

---

### Étape 5 : Créer le Service (`NotificationService.ts`)

```typescript
import { eventBus } from "../../core/bus";
import { NotificationCommands } from "./notification.commands";
import { NotificationEvents } from "./notification.events";
import { NotificationRepository } from "./NotificationRepository";
import type { SendNotificationInput, NotificationResponse } from "./notification.schema";

export class NotificationService {
	private static initialized = false;

	public static init(): void {
		if (this.initialized) return;
		this.initialized = true;

		// 1. Enregistrement du gestionnaire exclusif de la commande
		eventBus.registerHandler(NotificationCommands.send, async (input) => {
			return this.sendNotification(input);
		});
	}

	public static async sendNotification(input: SendNotificationInput): Promise<NotificationResponse> {
		const result = await NotificationRepository.save(input);

		// 2. Émission d'un événement asynchrone Fire & Forget
		eventBus.emit(NotificationEvents.sent, {
			notificationId: result.id,
			userId: input.userId,
		});

		return result;
	}
}
```

---

### Étape 6 : Créer le Contrôleur (`NotificationController.ts`)

```typescript
import type { Request, Response, NextFunction } from "express";
import { eventBus } from "../../core/bus";
import { NotificationCommands } from "./notification.commands";
import { ApiResponseFactory } from "../../utils";
import { getValidatedData } from "../../middlewares";
import type { SendNotificationInput } from "./notification.schema";

export class NotificationController {
	public async send(req: Request, res: Response, next?: NextFunction): Promise<void> {
		try {
			const { body } = getValidatedData<{ body: SendNotificationInput }>(req);

			// Invoque la commande via l'EventBus
			const result = await eventBus.request(NotificationCommands.send, body);

			ApiResponseFactory.created(res, result, "Notification envoyée avec succès.");
		} catch (error) {
			ApiResponseFactory.handleError(res, error, next, "Erreur lors de l'envoi de la notification");
		}
	}
}
```

---

### Étape 7 : Point d'Entrée du Module (`index.ts`)

```typescript
export * from "./notification.schema";
export * from "./notification.commands";
export * from "./notification.events";
export * from "./NotificationRepository";
export * from "./NotificationService";
export * from "./NotificationController";

export function initNotificationModule(): void {
	NotificationService.init();
}
```

---

## ⚡ Cas 2 : Créer un Module Connecteur Transparent (Mode Passthrough)

Ce mode est recommandé pour interfacer des workers externes asynchrones (ex: traitement lourd d'images, worker d'enrichissement de données) sans base de données locale.

### Étape 1 : Définir le Schéma avec Passthrough (`gateway.schema.ts`)

```typescript
import { z } from "zod";

export const GatewayTaskSchema = z
	.object({
		taskId: z.string().min(1),
		callbackUrl: z.string().url(),
	})
	.passthrough(); // Accepte tout paramètre supplémentaire sans altération

export type GatewayTask = z.infer<typeof GatewayTaskSchema>;
```

---

### Étape 2 : Définir la File et les Flux Redis (`gateway.streams.ts`)

```typescript
import { z } from "zod";
import { defineStreamEvent, defineWorkerQueue } from "../../core/stream";
import { GatewayTaskSchema } from "./gateway.schema";

export const GatewayStreamEvents = {
	// z.any() accepte le résultat brut renvoyé par le worker
	completed: defineStreamEvent("gateway.completed", z.any()),
	failed: defineStreamEvent("gateway.failed", z.object({ error: z.string().optional() }).passthrough()),
};

export const GatewayWorkerQueue = defineWorkerQueue({
	workerType: "GATEWAY_WORKER",
	pollIntervalMs: 5000, // Cadencement éco (palier slow 5s)
	requestSchema: GatewayTaskSchema,
	terminalEvents: [GatewayStreamEvents.completed.name, GatewayStreamEvents.failed.name],
	events: GatewayStreamEvents,
});
```

---

### Étape 3 : Créer le Service Connecteur (`GatewayService.ts`)

```typescript
import { redisStreamBus } from "../../core/stream";
import { eventBus, defineEvent } from "../../core/bus";
import { LoggerFactory } from "../../config/logger";
import { GatewayWorkerQueue, GatewayStreamEvents } from "./gateway.streams";
import { GatewayTaskSchema, type GatewayTask } from "./gateway.schema";

const logger = LoggerFactory.getLogger("GatewayService");

export const GatewayEvents = {
	submit: defineEvent("gateway.submit", GatewayTaskSchema),
};

export class GatewayService {
	private static initialized = false;

	public static init(): void {
		if (this.initialized) return;
		this.initialized = true;

		// 1. Écoute de l'événement d'entrée -> Publication vers la file Redis du worker
		eventBus.on(GatewayEvents.submit, async (task: GatewayTask) => {
			logger.info("Envoi de la tâche vers la file du worker", { taskId: task.taskId });
			await redisStreamBus.publishRequest(
				GatewayWorkerQueue,
				task.taskId,
				task,
				{ timeoutMs: 15 * 60 * 1000 }, // 15 min de surveillance max
			);
		});

		// 2. Écoute de la réponse du worker -> Transmission au webhook HTTP
		redisStreamBus.on(GatewayStreamEvents.completed, async ({ entityId, payload }) => {
			logger.info(`Tâche ${entityId} complétée par le worker, notification du webhook`);
			await fetch(payload.callbackUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
		});
	}
}
```

---

## 🚀 Étape Finale : Initialisation dans l'Application

Dans [`src/app.ts`](file:///home/tboutin/Documents/AGELID/api/src/app.ts), initialisez les modules au démarrage :

```typescript
import { initNotificationModule } from "./modules/notification";
import { GatewayService } from "./modules/gateway/GatewayService";

// Initialisation des handlers et écouteurs
initNotificationModule();
GatewayService.init();
```
