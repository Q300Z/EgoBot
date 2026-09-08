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

## Banc de charge et qualité

Le banc appelle le véritable agent et le véritable fournisseur LLM. Il crée
ses cas depuis les commandes et livraisons présentes en base, puis simule des
utilisateurs concurrents. Les requêtes d'un même utilisateur restent
séquentielles, comme dans une session réelle. Ces appels sont réellement
facturés par le fournisseur du modèle.

### 1. Se placer dans le package

Depuis la racine du dépôt :

```bash
cd packages/logistics-agent
```

Si le terminal est déjà dans `packages/logistics-agent`, ne pas relancer cette
commande. Il est aussi possible de rester à la racine et d'utiliser la commande
avec `--filter` présentée plus bas.

### 2. Configurer la base et le modèle

Créer le fichier local de configuration s'il n'existe pas encore :

```bash
cp .env.example .env
```

Configuration minimale avec l'API OpenAI :

```env
DATABASE_URL="file:./logistics.db"
LOGISTICS_MODEL_PROVIDER=openai
OPENAI_API_KEY="sk-..."
LOGISTICS_MODEL="gpt-5.6-luna"
```

Pour Azure OpenAI, utiliser à la place les variables
`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`,
`AZURE_OPENAI_API_DEPLOYMENT_NAME` et `AZURE_OPENAI_API_VERSION`, avec
`LOGISTICS_MODEL_PROVIDER=azure`.

### 3. Initialiser les données de test

À faire lors de la première utilisation, après une modification du schéma, ou
pour repartir d'un jeu de données propre :

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```

Le seed crée notamment 50 clients, 150 commandes et leurs livraisons. Il est
déterministe, mais il commence par purger les tables logistiques : ne pas le
lancer sur une base contenant des données à conserver. Le banc de charge ne
relance jamais automatiquement le seed et ne modifie pas les données.

### 4. Lancer le test

Commencer par une requête pour valider la clé, le modèle et la base :

```bash
pnpm test:load -- --users 1 --requests-per-user 1
```

Puis lancer la campagne souhaitée, par exemple 10 utilisateurs concurrents et
3 requêtes successives par utilisateur, soit 30 requêtes :

```bash
pnpm test:load -- --users 10 --requests-per-user 3
```

Commande équivalente depuis la racine du dépôt :

```bash
pnpm --filter @egobot/logistics-agent test:load -- --users 10 --requests-per-user 3
```

Options disponibles :

| Option | Variable d'environnement | Description | Défaut |
|---|---|---|---:|
| `--users N` | `LOAD_TEST_USERS` | Utilisateurs virtuels exécutés en parallèle | `5` |
| `--requests-per-user N` | `LOAD_TEST_REQUESTS_PER_USER` | Requêtes séquentielles par utilisateur | `2` |
| `--think-time-ms N` | `LOAD_TEST_THINK_TIME_MS` | Pause entre deux requêtes d'un utilisateur | `0` |
| `--report PATH` | `LOAD_TEST_REPORT` | Emplacement du rapport JSON | `reports/...json` |

Afficher l'aide sans appeler le modèle :

```bash
pnpm test:load -- --help
```

### 5. Consulter les résultats

Le rapport JSON et un comparatif CSV ouvrable dans Excel sont écrits dans
`reports/` :

```text
reports/logistics-load-test-<date>.json
reports/logistics-load-test-<date>-comparisons.csv
```

Ils contiennent :

- nombre d'utilisateurs, nombre de requêtes, durée et débit ;
- latences minimum, moyenne, p50, p95 et maximum, erreurs incluses ;
- score de qualité, nombre de réponses fondées et hallucinations suspectées ;
- tokens d'entrée, d'entrée mis en cache, de sortie et de raisonnement ;
- coût estimé total et moyen par réponse réussie ;
- détail de chaque réponse, outils appelés et faits attendus/manquants.

Le fichier `*-comparisons.csv` met côte à côte la réponse reçue et la réponse
canonique attendue depuis la base. Il indique aussi le verdict (`MATCH`,
`MISMATCH` ou `ERROR`), les faits manquants, l'outil attendu et réellement
appelé, ainsi que les références inattendues. Il peut être filtré sur les
verdicts différents de `MATCH` pour analyser uniquement les mauvaises réponses.
Les tokens y sont séparés entre entrée, entrée en cache, sortie, raisonnement
et total afin de rendre le calcul du coût vérifiable. Les retours à la ligne
des réponses sont représentés par `↵`, de sorte qu'une requête occupe toujours
une seule ligne physique dans le CSV.

Interprétation des verdicts :

- `MATCH` : les faits demandés correspondent à la base, le bon outil a été
  appelé et aucune référence métier inattendue n'a été trouvée ;
- `MISMATCH` : l'appel a réussi, mais au moins un fait, outil ou référence ne
  correspond pas aux données attendues ;
- `ERROR` : la requête n'a pas produit de réponse exploitable.

L'évaluation de qualité est déterministe et ne consomme pas un second appel
LLM. Une réponse est dite fondée si elle contient les faits attendus issus de
la base, a appelé l'outil métier requis et ne cite aucune référence
`CMD-...`/`LIV-...` étrangère au cas testé. Une « hallucination suspectée »
signale précisément une telle référence inattendue ; un fait manquant fait
baisser le score sans être automatiquement qualifié d'hallucination.

Par défaut, le coût utilise le tarif public de `gpt-5` vérifié dans la
[documentation officielle OpenAI](https://developers.openai.com/api/docs/models/gpt-5) :
1,25 USD/M tokens d'entrée, 0,125 USD/M tokens d'entrée en cache et
10 USD/M tokens de sortie. Le tarif public de `gpt-5.6-luna` est également
intégré depuis la
[documentation officielle OpenAI](https://developers.openai.com/api/docs/models/gpt-5.6-luna) :
0,20 USD/M tokens d'entrée, 0,02 USD/M tokens d'entrée en cache et
1,20 USD/M tokens de sortie. Si `LOGISTICS_MODEL` désigne un autre modèle, le
script refuse une estimation trompeuse tant que ses trois tarifs ne sont pas
explicitement fournis :

```bash
LOAD_TEST_INPUT_USD_PER_MILLION=1.25 \
LOAD_TEST_CACHED_INPUT_USD_PER_MILLION=0.125 \
LOAD_TEST_OUTPUT_USD_PER_MILLION=10 \
LOAD_TEST_PRICING_SOURCE="URL ou grille contractuelle" \
pnpm test:load -- --users 10 --requests-per-user 3
```

### Dépannage

- `Command "test:load" not found` : le terminal est à la racine ; utiliser la
  commande avec `--filter`, ou entrer dans `packages/logistics-agent`.
- `The table main.Customer does not exist` : exécuter `prisma migrate deploy`,
  puis `prisma db seed` depuis `packages/logistics-agent`.
- `OPENAI_API_KEY ... requis` ou `AZURE_OPENAI_API_KEY ... requis` : vérifier
  le fournisseur et la clé dans `packages/logistics-agent/.env`.
- `Aucun tarif vérifié n'est embarqué` : utiliser un modèle dont le tarif est
  intégré, ou fournir les trois variables `LOAD_TEST_*_USD_PER_MILLION`
  décrites ci-dessus.

La configuration Prisma utilise `DATABASE_URL`. La valeur de repli de
`prisma.config.ts` sert uniquement aux commandes de génération et de
validation ; l'exécution de l'application exige une URL explicite.
