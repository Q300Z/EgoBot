# 🚀 AGELID Backend Framework

API backend haute performance pour l'orchestration de modèles de langage (LLM) et le streaming d'inférence en temps réel, basée sur une architecture **Domain-Driven Design (DDD)** et **Event-Driven Architecture (EDA)**.

---

## ⚡ Caractéristiques Principales

- **Architecture Événementielle Typée (`TypedEventBus`)** : Découplage strict entre domaines métier avec validation Zod synchrone/asynchrone.
- **Streaming Temps Réel Server-Sent Events (SSE)** : Diffusion de tokens d'inférence avec bufferisation et relecture automatique depuis les **Redis Streams (`XRANGE`)**.
- **Persistance SQLite Haute Performance** : Moteur SQLite 3 natif en mode **WAL (Write-Ahead Logging)** via `better-sqlite3` et Prisma 7.
- **Schedulers Résilients (`SafeInterval`)** : Tâches d'arrière-plan avec verrous anti-chevauchement (_anti-overlapping_) et auto-récupération d'erreurs.
- **Authentification Hybride V1 / V2** : Prise en charge native du déchiffrement symétrique **Blowfish ECB PKCS5** (`egoroof-blowfish`) et tokens JWT signés avec **`jose`** (HS256).
- **Traçabilité Distribuée** : Propagation transparente du `correlationId` et des métadonnées utilisateur via `AsyncLocalStorage` dans des logs structurés **Pino**.
- **Build Ultra-Rapide** : Compilation et packaging de production en ~4ms avec **`esbuild`**.

---

## 📋 Prérequis

- **Node.js** : `>= 20.6.0` (support natif de `process.loadEnvFile()` et modules ESM).
- **pnpm** : `>= 9.0.0`
- **Redis** : `>= 6.2.0` (pour le support des Streams Redis et groupes de consommateurs).

---

## 🚀 Démarrage Rapide

### 1. Installation des dépendances

```bash
pnpm install
```

### 2. Configuration de l'environnement

Créez un fichier `.env` à la racine :

```env
PORT=3000
NODE_ENV=development
SECRET_KEY=votre_cle_secrete_jwt_tres_longue_et_aleatoire
REDIS_URL=redis://localhost:6379
DATABASE_URL="file:./dev.db"
```

### 3. Initialisation de la base de données

```bash
pnpm prisma:push
pnpm prisma:generate
```

### 4. Lancement en mode développement

```bash
pnpm dev
```

---

## 🛠️ Scripts Disponibles

| Commande                 | Description                                                                                     |
| :----------------------- | :---------------------------------------------------------------------------------------------- |
| **`pnpm dev`**           | Démarre le serveur en mode watch interactif via `tsx`.                                          |
| **`pnpm build`**         | Génère le client Prisma et compile le bundle de production dans `dist/index.js` avec `esbuild`. |
| **`pnpm start`**         | Démarre l'API de production compilée (`node dist/index.js`).                                    |
| **`pnpm test`**          | Exécute les tests unitaires et d'intégration Vitest (113 tests).                                |
| **`pnpm test:coverage`** | Génère le rapport de couverture de code v8.                                                     |
| **`pnpm test:load`**     | Lance le banc de test de charge simulant les workers IA avec rapport HTML.                      |
| **`pnpm check-types`**   | Vérifie le typage strict TypeScript sans émettre de fichiers.                                   |
| **`pnpm lint`**          | Analyse le code avec ESLint Flat Config.                                                        |
| **`pnpm prisma:studio`** | Ouvre l'interface graphique de consultation de la base SQLite.                                  |

---

## 📚 Documentation Technique

La documentation exhaustive et les guides d'architecture sont disponibles dans le dossier [`docs/`](./docs/) :

- [**01. Architecture Globale**](./docs/01-architecture-globale.md)
- [**02. Anatomie d'un Module**](./docs/02-anatomie-d-un-module.md)
- [**03. Guide : Créer un Module**](./docs/03-guide-creation-nouveau-module.md)
- [**04. TypedEventBus & Commandes**](./docs/04-eventbus-et-commandes-custom.md)
- [**05. Streaming Temps Réel SSE**](./docs/05-streaming-temps-reel-sse.md)
- [**06. Schedulers & Crons Sécurisés**](./docs/06-schedulers-et-taches-de-fond.md)
- [**07. Base SQLite & Mode WAL**](./docs/07-base-de-donnees-sqlite-et-wal.md)
- [**08. Infrastructure Pools Redis**](./docs/08-infrastructure-pools-redis.md)
- [**09. Logs & Traçabilité Distribuée**](./docs/09-logs-et-tracabilite-distribuee.md)
- [**10. Authentification & Blowfish V2**](./docs/10-authentification-et-chiffrement-blowfish.md)
- [**11. Réponses HTTP & Validation Zod**](./docs/11-reponses-http-erreurs-et-validation.md)
- [**12. Uploads de Fichiers (Multer)**](./docs/12-gestion-uploads-multer.md)
- [**13. Tests & Banc d'Essai de Charge**](./docs/13-tests-qualite-et-banc-de-charge.md)
