# 04. TypedEventBus & Commandes Personnalisées

Le `TypedEventBus` ([`src/core/bus/eventBus.ts`](file:///home/tboutin/Documents/AGELID/api/src/core/bus/eventBus.ts)) constitue la colonne vertébrale du découplage inter-domaines au sein du backend AGELID. Il applique strictement les principes de l'**Event-Driven Architecture (EDA)** et du pattern **Command-Query Responsibility Segregation (CQRS)** en mémoire.

---

## 🎯 Commandes vs Événements

Le bus repose sur une séparation nette entre **Commandes** (intention synchrone avec résultat) et **Événements** (notification asynchrone d'un fait accompli).

| Caractéristique         | Commande (`defineCommand`)                          | Événement (`defineEvent`)                                   |
| :---------------------- | :-------------------------------------------------- | :---------------------------------------------------------- |
| **Pattern**             | Request / Response (synchrone)                      | Fire & Forget (asynchrone)                                  |
| **Méthodes du Bus**     | `registerHandler()` / `request()`                   | `emit()` / `on()`                                           |
| **Destinataire**        | **Exactement 1 seul gestionnaire exclusif**         | **0, 1 ou N écouteurs**                                     |
| **Retour de valeur**    | Typé et validé (`Promise<z.infer<TOut>>`)           | Aucun retour (`void`)                                       |
| **Timeout de sécurité** | Oui (15 000 ms par défaut, configurable)            | Non                                                         |
| **Usage type**          | Exécuter une action métier ou interroger un domaine | Notifier un changement d'état (ex: entité créée, supprimée) |

```mermaid
flowchart LR
    subgraph Commands_Flow ["Pattern Commande (Request / Reply)"]
        Caller[Module Appelant] -->|request(Command, input)| BusCmd[TypedEventBus]
        BusCmd -->|Exécute le handler exclusif| Handler[Unique Command Handler]
        Handler -->|Retourne le résultat typé| BusCmd
        BusCmd -->|Valide & Renvoie output| Caller
    end

    subgraph Events_Flow ["Pattern Événement (Fire & Forget)"]
        Emitter[Module Émetteur] -->|emit(Event, payload)| BusEvt[TypedEventBus]
        BusEvt -.->|Notifie en parallèle| Sub1[Écouteur Module A]
        BusEvt -.->|Notifie en parallèle| Sub2[Écouteur Module B]
        BusEvt -.->|Notifie en parallèle| Sub3[Écouteur Module C]
    end
```

---

## 📚 L'API Exclusive du `TypedEventBus` (4 Méthodes)

L'instance `TypedEventBus` expose strictement et exclusivement **4 méthodes métier** :

1. [`registerHandler(command, handler)`](#1-enregistrer-le-gestionnaire-dune-commande--registerhandler) : Enregistre le gestionnaire unique d'une commande.
2. [`request(command, input, timeoutMs?)`](#2-invoquer-une-commande-synchrone--request) : Invoque une commande avec timeout et validation runtime.
3. [`emit(event, payload)`](#3-émettre-un-événement-asynchrone--emit) : Diffuse un événement sans attente de réponse.
4. [`on(event, handler)`](#4-écouter-un-événement-asynchrone--on) : Abonne un écouteur avec propagation automatique du contexte de traçabilité.

---

## 🛠️ Utilisation des Commandes Métier

### 1. Définition du Contrat (`defineCommand`)

Les commandes sont déclarées dans `<domaine>.commands.ts` à l'aide de schémas **Zod** pour l'entrée et la sortie :

```typescript
import { z } from "zod";
import { defineCommand } from "../../core/bus";

export const CalculateStatsCommand = defineCommand(
	"stats.calculate",
	z.object({
		userId: z.string().min(1),
		periodDays: z.number().int().min(1).default(30),
	}),
	z.object({
		totalMessages: z.number(),
		totalTokens: z.number(),
		averageLatencyMs: z.number(),
	}),
);
```

---

### 2. Enregistrer le Gestionnaire d'une Commande : `registerHandler()`

Un seul service de l'application doit enregistrer le handler pour une commande donnée. Tout doublon lève une exception immédiate au démarrage.

```typescript
import { eventBus } from "../../core/bus";
import { CalculateStatsCommand } from "./stats.commands";
import { StatsRepository } from "./StatsRepository";

export class StatsService {
	private static initialized = false;

	public static init(): void {
		if (this.initialized) return;
		this.initialized = true;

		eventBus.registerHandler(CalculateStatsCommand, async (input) => {
			// input est typé et validé par inputSchema
			const stats = await StatsRepository.compute(input.userId, input.periodDays);

			// La valeur retournée est validée à l'exécution par outputSchema
			return stats;
		});
	}
}
```

---

### 3. Invoquer une Commande Synchrone : `request()`

N'importe quel contrôleur ou service peut exécuter la commande de façon découplée :

```typescript
import type { Request, Response } from "express";
import { eventBus } from "../../core/bus";
import { CalculateStatsCommand } from "../stats/stats.commands";
import { ApiResponseFactory } from "../../utils";

export class AdminController {
	public async getStats(req: Request, res: Response): Promise<void> {
		// Invoque la commande avec un timeout personnalisé de 10 secondes
		const result = await eventBus.request(
			CalculateStatsCommand,
			{
				userId: req.params.userId,
				periodDays: 60,
			},
			10_000,
		);

		ApiResponseFactory.success(res, result);
	}
}
```

---

## 📢 Utilisation des Événements Métier

### 1. Définition de l'Événement (`defineEvent`)

Les événements sont déclarés dans `<domaine>.events.ts` :

```typescript
import { z } from "zod";
import { defineEvent } from "../../core/bus";

export const UserBannedEvent = defineEvent(
	"user.banned",
	z.object({
		userId: z.string(),
		reason: z.string(),
		bannedAt: z.date(),
		correlationId: z.string().optional(),
	}),
);
```

---

### 2. Émettre un Événement Asynchrone : `emit()`

L'émission valide le payload contre le schéma Zod et propage le contexte de trace :

```typescript
import { eventBus } from "../../core/bus";
import { UserBannedEvent } from "./user.events";

// Émission Fire & Forget
eventBus.emit(UserBannedEvent, {
	userId: "usr_4289",
	reason: "Non-respect des conditions d'utilisation",
	bannedAt: new Date(),
});
```

---

### 3. Écouter un Événement Asynchrone : `on()`

La méthode `on()` enregistre un écouteur et renvoie une fonction de désinscription propre :

```typescript
import { eventBus } from "../../core/bus";
import { UserBannedEvent } from "../user/user.events";
import { JobService } from "../job/JobService";
import { AuthRepository } from "../auth/AuthRepository";

export class UserActivitySubscriber {
	public static init(): () => void {
		// Abonnement dans JobService : annulation des calculs en cours
		const unsubscribeJob = eventBus.on(UserBannedEvent, async ({ userId }) => {
			await JobService.cancelAllJobsForUser(userId);
		});

		// Abonnement dans AuthService : révocation des sessions actives
		const unsubscribeAuth = eventBus.on(UserBannedEvent, async ({ userId }) => {
			await AuthRepository.deleteLogipolConfig(userId);
		});

		// Renvoie une fonction de nettoyage pour les tests ou le rechargement
		return () => {
			unsubscribeJob();
			unsubscribeAuth();
		};
	}
}
```

---

## 🛡️ Résilience, Traçabilité & Timeouts

### 1. Gestion Robuste des Timeouts

Lors d'un appel `eventBus.request(command, input, timeoutMs)` :

- Si le handler met plus de temps que le délai alloué (`timeoutMs`, défaut 15 000 ms), la promesse est rejetée avec une erreur explicite.
- Le timer Node.js est **systématiquement libéré** dans une clause `finally` via `clearTimeout()`, garantissant l'absence de fuite de mémoire ou de descripteurs d'événements.

### 2. Propagation Contextuelle de la Trace (`AsyncLocalStorage`)

- Le `TypedEventBus` extrait automatiquement le `correlationId`, `userId` et `email` du payload ou de l'environnement courant (`traceStorage.getStore()`).
- Lors de l'exécution des handlers ou des écouteurs `on()`, le contexte `traceStorage.run(traceContext, ...)` est restauré, garantissant que tous les logs émis dans les services distants conservent le même identifiant de corrélation de bout en bout.
