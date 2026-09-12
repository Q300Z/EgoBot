# 📚 AGELID Backend Framework - Documentation Technique

Bienvenue dans la documentation technique de référence du framework backend **AGELID**.  
Cette documentation détaille l'architecture modulaire, le bus d'événements typé, le moteur Redis Streams, le streaming temps réel (SSE), la gestion des pools de connexion et le guide de création de nouveaux modules.

---

## 🗺️ Sommaire de la Documentation

1. [**01. Architecture Globale**](./01-architecture-globale.md)
   - Principes fondamentaux (EDA, DDD, SQLite WAL, Redis Streams).
   - Cartographie complète du socle technique (`src/core/` : `bus/`, `stream/`, `sse/`, `scheduler/`, `errors/`).
   - Diagramme d'architecture des couches et traçabilité contextuelle (`correlationId`).

2. [**02. Anatomie d'un Module de Domaine**](./02-anatomie-d-un-module.md)
   - Structure standard en 8 fichiers par domaine.
   - Les 2 archétypes : **Mode Domaine Métier** (ex: `conversation`, `job`) vs **Mode Connecteur Transparent Passthrough** (ex: `gv/demande`).
   - Règle d'or de découplage inter-modules.

3. [**03. Guide : Créer un Nouveau Module**](./03-guide-creation-nouveau-module.md)
   - Guide pas-à-pas pour créer un module de domaine métier complet (`notification`).
   - Guide pas-à-pas pour créer un module connecteur transparent passthrough (`gateway`).
   - Initialisation dans `src/app.ts` et routage Express.

4. [**04. TypedEventBus & Commandes Personnalisées**](./04-eventbus-et-commandes-custom.md)
   - Modèle Command-Query / Event-Driven en mémoire.
   - L'API exclusive à 4 méthodes : `registerHandler()`, `request()`, `emit()`, `on()`.
   - Contrats typés Zod via `defineCommand` et `defineEvent`.
   - Propagation automatique du contexte de trace (`traceStorage`).

5. [**05. Streaming Temps Réel SSE & Socle Stream**](./05-streaming-temps-reel-sse.md)
   - Le socle `src/core/stream/` : `defineWorkerQueue`, `defineStreamEvent`, `RedisStreamBus`, `StreamObserver`.
   - Cadencement multi-niveaux (_Tiered Polling_ : Fast 100ms pour SSE, Slow 5s pour workers longs).
   - Chunking par lots de 50 clés sur pool RESP2 et isolation anti-poison-pill.
   - Le moteur `SseService` : `BufferedSession`, synchronisation d'historique `XRANGE`, et déduplication `Last-Event-ID`.

6. [**06. Schedulers & Tâches d'Arrière-Plan Sécurisées**](./06-schedulers-et-taches-de-fond.md)
   - Fonctionnement de `createSafeInterval` (verrou anti-chevauchement, capture d'exceptions).
   - Intégration d'un Scheduler dans un module de domaine.
   - Gestion du démarrage et du _Graceful Shutdown_.

7. [**07. Base de Données SQLite & Mode WAL**](./07-base-de-donnees-sqlite-et-wal.md)
   - Haute concurrence avec `PRAGMA journal_mode = WAL;` et `better-sqlite3`.
   - Gestion du verrou d'écriture unique (_Single-Writer Lock_) et transactions Prisma.
   - Synchronisation et migrations de schéma.

8. [**08. Infrastructure des Pools Redis & Moteur Stream**](./08-infrastructure-pools-redis.md)
   - Les 3 pools de connexions dédiés (`redisStream` RESP2, `redisReader` RESP3, `redisWriter` RESP3).
   - Pipelines atomiques `multi()` (XADD + TTL 12h + Set JobEnv).
   - Fabrique centralisée des clés (`StreamKeys`).
   - Reconnexion exponentielle avec Jitter anti-thundering herd et proxy de journalisation `wrapWithLogging`.

9. [**09. Système de Logs & Traçabilité Distribuée**](./09-logs-et-tracabilite-distribuee.md)
   - Journalisation Pino haute performance.
   - Corrélation distribuée de bout en bout via `AsyncLocalStorage` (`traceStorage`).

10. [**10. Authentification & Chiffrement Blowfish V2**](./10-authentification-et-chiffrement-blowfish.md)
    - Déchiffrement symétrique Blowfish ECB PKCS5 (`egoroof-blowfish`).
    - Format de token JWT (`jose` HS256) et persistance des sessions Redis.

11. [**11. Réponses HTTP, Erreurs & Validation Zod**](./11-reponses-http-erreurs-et-validation.md)
    - Format de réponse unifié `ApiResponseFactory`.
    - Hiérarchie `HttpError` et middleware de validation automatique `validate()`.

12. [**12. Gestion des Uploads de Fichiers (Multer)**](./12-gestion-uploads-multer.md)
    - Uploads sécurisés d'images (limite 5 Mo, validation MIME, stockage isolé).

13. [**13. Tests, Qualité & Banc d'Essai de Charge**](./13-tests-qualite-et-banc-de-charge.md)
    - Configuration Vitest (mono-worker SQLite WAL).
    - Script d'évaluation de charge haute concurrence `load-test.ts`.

---

## ⚡ Les Règles Clés du Framework

- **Découplage strict** : Un module ne doit **jamais** importer directement le `Repository` d'un autre module. Toute communication inter-domaine passe par le `TypedEventBus` (`eventBus.request()`, `eventBus.emit()`) ou `RedisStreamBus`.
- **Validation Zod universelle** : Chaque commande, événement, file de worker et payload HTTP est strictement validé à l'exécution.
- **Résilience des crons** : Aucun `setInterval` natif ; toutes les tâches récurrentes exploitent `createSafeInterval`.
- **Zero-loss SSE** : Les flux de réponses sont persistés dans Redis Streams (TTL 12h) avec support du rejeu automatique lors des reconnexions.
