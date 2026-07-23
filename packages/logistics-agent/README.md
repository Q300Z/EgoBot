# @egobot/logistics-agent

Package LangChain de consultation logistique pour EgoBot. Il relie un LLM à
des services métier en lecture seule, eux-mêmes adossés à Prisma/PostgreSQL.

## Architecture

```text
src/
├── agent/       # Factory createAgent et prompt système
├── database/    # Création explicite du client Prisma PostgreSQL
├── dtos/        # Contrats Zod sérialisables retournés au LLM
├── services/    # Services par entité/cas d'usage et mapping vers les DTOs
├── tools/       # Adaptateurs LangChain orientés cas d'usage
prisma/
├── generated/   # Client Prisma généré
└── schema.prisma
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

`CustomerService` est strictement limité à l'entité `Customer` et à sa
relation `currentAddress`. Il propose uniquement des recherches par
identifiant, numéro client ou e-mail, ainsi que les lectures ciblées de
l'identité et de l'adresse courante. Il ne modifie aucune donnée et ne
duplique aucune opération de commande, livraison ou stock.

`OrderService` suit la même organisation pour l'entité `Order` : recherche
par identifiant ou numéro, dernière commande d'un client, liste et recherche
paginées, comptage, statut et détails complets. Toutes ses opérations sont
en lecture seule.

Les outils LangChain n'exposent que les lectures du client authentifié. Les
commandes, livraisons et stocks appellent directement `OrderService`,
`DeliveryQueryService` et `InventoryQueryService`.

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
Une instance `ChatOpenAI` peut aussi être injectée avec l'option `model`.

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
