# @egobot/logistics-agent

Package LangChain de consultation logistique pour EgoBot. Il relie un LLM à
des services métier en lecture seule, eux-mêmes adossés à Prisma/SQLite.

## Architecture

```text
src/
├── agent/       # Factory createAgent et prompt système
├── database/    # Création explicite du client Prisma SQLite (better-sqlite3)
├── dtos/        # Contrats Zod sérialisables retournés au LLM
├── services/    # Requêtes Prisma filtrées et mapping vers les DTOs
├── runtime/     # Résolution du client et exécution d'une requête
└── tools/       # Adaptateurs LangChain orientés cas d'usage
prisma/
├── generated/   # Client Prisma généré
├── schema.prisma
└── seed.ts      # Générateur du jeu de données de test
```

Les outils disponibles sont :

- `get_customer_profile`
- `get_customer_identity`
- `get_customer_current_address`
- `get_order_status`
- `get_order_details`
- `get_last_order`
- `get_delivery_tracking`
- `get_product_availability`

L'identifiant client ne fait jamais partie des paramètres visibles par le
LLM. Il est validé puis capturé depuis la session serveur lors de la création
des outils. Les requêtes de commande et de livraison appliquent ce filtre
directement dans Prisma.

`CustomerService` reste limité aux lectures de l'entité `Customer` et de son
adresse courante. `OrderService` regroupe les lectures de l'entité `Order`.
`CustomerQueryService` a un rôle distinct : il résout l'identité fournie par
l'application avant de construire les outils liés au client.

---

## Mise en route de la base de données

Base **SQLite locale** (fichier), aucune installation de serveur requise.

### 1. Configurer la connexion

Copier `.env.example` en `.env` (la valeur par défaut, `file:./logistics.db`,
convient déjà pour le développement local — rien à modifier).

### 2. Créer les tables

Les commandes suivantes se lancent **depuis ce dossier** (`packages/logistics-agent`),
faute de quoi le `.env` ne serait pas trouvé :

```bash
pnpm exec prisma migrate dev
```
*(Génère aussi le client Prisma automatiquement.)*

### 3. Remplir la base

```bash
pnpm exec prisma db seed
```

### 4. Visualiser (optionnel)

```bash
pnpm exec prisma studio
```

---

## Le jeu de données de test

Environ 80 articles, 8 fournisseurs, 50 clients, 150 commandes réparties sur
huit mois, leurs livraisons et l'historique complet des mouvements de stock —
soit plus de 1 300 écritures.

**Déterministe.** La graine aléatoire est fixe (`faker.seed`), donc deux
exécutions produisent une base rigoureusement identique. Les tests peuvent
s'appuyer sur une commande précise sans crainte qu'elle disparaisse.

**Idempotent.** Le script purge les tables avant d'écrire. Il est relançable
autant de fois que nécessaire.

**Volontairement imparfait.** Ruptures de stock, articles sous seuil de
sécurité, livraisons échouées ou retournées, commandes annulées et
remboursées, clients et articles désactivés. Un jeu entièrement nominal ne
permettrait de tester aucun cas dégradé.

### Cohérence garantie

`@faker-js/faker` ne fournit que les valeurs de surface — noms, adresses,
raisons sociales. Tout ce qui doit être cohérent est calculé par le script.
Les montants sont manipulés en centimes entiers, aucune addition ne passe par
un flottant.

Six invariants sont recontrôlés en fin d'exécution, en relisant la base :

| | Invariant |
|---|---|
| A | `Order.subtotalAmount` = Σ `OrderLinePrice.lineTotalExcludingTax` |
| B | `Order.totalIncludingTax` = `totalExcludingTax` + `taxAmount` |
| C | `StockItem.onHandQuantity` = Σ des mouvements physiques |
| D | `StockItem.reservedQuantity` = Σ des mouvements logiques |
| E | `StockItem.availableQuantity` = `onHand` − `reserved` |
| F | Σ `DeliveryLine.shippedQuantity` ≤ `OrderLine.orderedQuantity` |

Si l'un d'eux est violé, le script échoue en erreur plutôt que de laisser une
base subtilement fausse.

### Interprétation retenue pour les mouvements de stock

Le journal tient **deux compteurs distincts** :

- `RECEIPT`, `SHIPMENT`, `ADJUSTMENT`, `RETURN` → alimentent `onHandQuantity`
- `RESERVATION`, `RELEASE` → alimentent `reservedQuantity`

Une réservation ne retire donc rien du stock physique : elle réserve. Cette
lecture est à valider par l'équipe ; si elle ne convient pas, la fonction
`buildStock` du seed est à revoir.

---

## Utilisation de l'agent

```ts
import {
  createLogisticsAgent,
  createPrismaClient,
} from "@egobot/logistics-agent";

const prisma = createPrismaClient(process.env.DATABASE_URL);

const agent = createLogisticsAgent({
  customer: {
    customerId: session.customer.id,
    email: session.customer.email,
  },
  prisma,
});

const result = await agent.invoke({
  messages: [
    {
      role: "user",
      content: "Où en est ma commande CMD-2026-0042 ?",
    },
  ],
});
```

`LOGISTICS_MODEL` permet de remplacer le modèle OpenAI par défaut (`gpt-5`).
Toute instance de chat model LangChain (`ChatOpenAI`, `AzureChatOpenAI`, etc.)
peut aussi être injectée avec l'option `model`.

### Utiliser Azure OpenAI

Le fournisseur du modèle par défaut (utilisé quand l'option `model` n'est pas
fournie) se sélectionne via `LOGISTICS_MODEL_PROVIDER` :

- `openai` (défaut) — construit un `ChatOpenAI`.
- `azure` — construit un `AzureChatOpenAI`.

Il suffit donc de définir les variables d'environnement suivantes, sans
toucher au code des appelants :

```bash
LOGISTICS_MODEL_PROVIDER=azure
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_API_INSTANCE_NAME=mon-instance
AZURE_OPENAI_API_DEPLOYMENT_NAME=mon-deploiement-gpt5
AZURE_OPENAI_API_VERSION=2026-01-01
```

- `AZURE_OPENAI_API_INSTANCE_NAME` (ou `AZURE_OPENAI_ENDPOINT` pour un
  endpoint personnalisé, ex. une autre région)
- `AZURE_OPENAI_API_DEPLOYMENT_NAME` : le nom du déploiement créé dans le
  portail Azure, pas le nom du modèle
- `AZURE_OPENAI_API_VERSION` : version d'API Azure OpenAI, indépendante des
  versions OpenAI

Aucune `temperature` n'est fixée par défaut : les modèles de raisonnement
(familles GPT-5 / o-series, sur OpenAI comme sur Azure) rejettent toute valeur
non par défaut avec une erreur 400 (`Only the default (1) value is
supported`). Si un déploiement en accepte une, l'injecter via l'option
`model` (voir plus bas).

Pour l'authentification Microsoft Entra ID (Managed Identity), qui ne peut
pas se réduire à une variable d'environnement, ou pour tout autre besoin de
configuration avancée, injecte directement une instance via l'option
`model` :

```ts
import { AzureChatOpenAI } from "@langchain/openai";
import { createLogisticsAgent, createPrismaClient } from "@egobot/logistics-agent";

const prisma = createPrismaClient(process.env.DATABASE_URL);

const agent = createLogisticsAgent({
  customer: {
    customerId: session.customer.id,
    email: session.customer.email,
  },
  prisma,
  model: new AzureChatOpenAI({
    azureADTokenProvider: getEntraIdToken,
    azureOpenAIApiDeploymentName: "mon-deploiement-gpt5",
  }),
});
```

L'option `model` explicite est toujours prioritaire sur
`LOGISTICS_MODEL_PROVIDER`.

## Commandes

```bash
pnpm --filter @egobot/logistics-agent prisma:validate
pnpm --filter @egobot/logistics-agent prisma:generate
pnpm --filter @egobot/logistics-agent test
pnpm --filter @egobot/logistics-agent build
```

La configuration Prisma utilise `DATABASE_URL`. La valeur de repli de
`prisma.config.ts` sert uniquement aux commandes de génération et de
validation ; l'exécution de l'application exige une URL explicite.