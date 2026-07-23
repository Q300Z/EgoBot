# @egobot/logistics-agent

Package LangChain de consultation logistique pour EgoBot. Il relie un LLM à
des services métier en lecture seule, eux-mêmes adossés à Prisma/PostgreSQL.

## Architecture

```text
src/
├── agent/       # Factory createAgent et prompt système
├── database/    # Création explicite du client Prisma PostgreSQL
├── dtos/        # Contrats Zod sérialisables retournés au LLM
├── services/    # Requêtes Prisma filtrées et mapping vers les DTOs
├── tools/       # Adaptateurs LangChain orientés cas d'usage
└── generated/   # Client Prisma généré
prisma/
└── schema.prisma
```

Les outils disponibles sont :

- `get_order_status`
- `get_order_details`
- `get_delivery_tracking`
- `get_product_availability`

L'identifiant client ne fait jamais partie des paramètres visibles par le
LLM. Il est validé puis capturé depuis la session serveur lors de la création
des outils. Les requêtes de commande et de livraison appliquent ce filtre
directement dans Prisma.

## Utilisation

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
    temperature: 0,
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
