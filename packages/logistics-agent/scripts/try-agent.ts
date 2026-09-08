/**
 * Script de test manuel de l'agent logistique.
 *
 * Usage :
 *   pnpm try:agent
 *   pnpm try:agent CLI-000123
 *   pnpm try:agent CLI-000123 "Où en est ma commande CMD-2026-000042 ?"
 *
 * Il sélectionne un client, affiche ses cinq dernières commandes (pour pouvoir
 * juger si la réponse de l'agent est correcte ou inventée), pose une question
 * à l'agent et diffuse sa réponse au fil de l'eau.
 */
import "dotenv/config";
import { createPrismaClient, runLogisticsQuery } from "../src/index.js";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// 2. Vérifier la configuration AVANT de laisser LangChain planter.
if (!process.env.DATABASE_URL) {
  fail(
    "DATABASE_URL est absent. Renseignez-le dans packages/logistics-agent/.env " +
      "(ex. postgresql://postgres:motdepasse@localhost:5432/egobot).",
  );
}
// Le fournisseur peut être OpenAI ou Azure depuis l'ajout du support Azure :
// vérifier la clé correspondante, et non OPENAI_API_KEY dans tous les cas.
const provider = process.env.LOGISTICS_MODEL_PROVIDER ?? "openai";

if (provider === "azure") {
  if (!process.env.AZURE_OPENAI_API_KEY) {
    fail(
      "AZURE_OPENAI_API_KEY est absent alors que LOGISTICS_MODEL_PROVIDER=azure. " +
        "Renseignez également AZURE_OPENAI_ENDPOINT, " +
        "AZURE_OPENAI_API_DEPLOYMENT_NAME et AZURE_OPENAI_API_VERSION.",
    );
  }
} else if (!process.env.OPENAI_API_KEY) {
  fail(
    "OPENAI_API_KEY est absent. Renseignez-le dans packages/logistics-agent/.env " +
      "(clé API OpenAI, ex. sk-...).",
  );
}

// 3. Deux arguments optionnels : un customerNumber, puis une question.
const [customerNumberArg, ...questionParts] = process.argv.slice(2);
const questionArg = questionParts.join(" ").trim();

const prisma = createPrismaClient();

try {
  // 4. Le client demandé, ou à défaut le premier client actif ayant au moins
  //    une commande, trié par customerNumber.
  const customer = customerNumberArg
    ? await prisma.customer.findFirst({
        where: { customerNumber: customerNumberArg },
      })
    : await prisma.customer.findFirst({
        where: { isActive: true, orders: { some: {} } },
        orderBy: { customerNumber: "asc" },
      });

  if (!customer) {
    fail(
      customerNumberArg
        ? `Aucun client trouvé pour le numéro ${customerNumberArg}.`
        : "Aucun client actif avec au moins une commande dans la base.",
    );
  }

  // 5. Identité + cinq dernières commandes : indispensable pour juger la réponse.
  const orders = await prisma.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      orderNumber: true,
      status: true,
      totalIncludingTax: true,
      orderedAt: true,
      createdAt: true,
    },
  });

  console.log(
    `Client : ${customer.customerNumber} — ${customer.firstName} ${customer.lastName} <${customer.email}>`,
  );
  console.log(`Actif  : ${customer.isActive}`);
  console.log("\n5 dernières commandes :");
  if (orders.length === 0) {
    console.log("  (aucune)");
  }
  for (const order of orders) {
    const date = (order.orderedAt ?? order.createdAt).toISOString().slice(0, 10);
    console.log(
      `  ${order.orderNumber}  ${order.status.padEnd(18)}  ${order.totalIncludingTax} €  ${date}`,
    );
  }

  const question =
    questionArg ||
    (orders[0]
      ? `Quel est le statut de ma commande ${orders[0].orderNumber} ?`
      : "Quelles sont mes dernières commandes ?");

  console.log(`\nQuestion : ${question}\n`);
  console.log("Réponse  :");

  // 6. Diffusion au fil de l'eau sur la sortie standard.
  const start = Date.now();
  const result = await runLogisticsQuery({
    prisma,
    identity: { customerId: customer.id, email: customer.email },
    question,
    onToken: (chunk) => process.stdout.write(chunk),
  });
  const durationSeconds = ((Date.now() - start) / 1000).toFixed(1);

  console.log("\n");

  if (!result.ok) {
    console.log(`Échec (${result.reason}) : ${result.message}`);
  } else {
    // 7. Durée + liste des outils appelés.
    console.log(`Durée         : ${durationSeconds}s`);
    console.log(
      `Outils appelés : ${result.toolCalls.length ? result.toolCalls.join(", ") : "(aucun)"}`,
    );
    if (result.cancelled) {
      console.log("Diffusion interrompue avant la fin.");
    }
    // 8. Aucun outil appelé = réponse non sourcée, donc inventée.
    if (result.toolCalls.length === 0) {
      console.warn(
        "\n⚠️  Aucun outil appelé : l'agent n'a aucun autre moyen de connaître " +
          "l'état réel d'une commande, il a donc inventé sa réponse.",
      );
    }
  }
} finally {
  // 9. Toujours fermer la connexion.
  await prisma.$disconnect();
}
