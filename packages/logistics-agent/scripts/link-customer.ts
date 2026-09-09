/**
 * Rattache une adresse e-mail à un client de la base logistique.
 *
 *   pnpm --filter @egobot/logistics-agent exec tsx scripts/link-customer.ts mon@email.fr
 *
 * L'agent identifie le client par l'adresse e-mail du compte EgoBot connecté.
 * Or les clients sont générés aléatoirement par le seed : aucun ne porte
 * l'adresse d'un développeur, et toute question logistique répond donc
 * « aucun compte client ne correspond ».
 *
 * Ce script réaffecte l'adresse au client possédant LE PLUS DE COMMANDES,
 * plutôt que d'en créer un nouveau : un client sans historique donnerait un
 * agent qui fonctionne mais n'a rien à raconter.
 *
 * Pour rattacher plusieurs comptes de démo sans qu'ils ne se disputent le
 * même client (le plus fourni), exclure ceux déjà attribués :
 *
 *   tsx scripts/link-customer.ts autre@email.fr --exclude=admin@egobot.local
 *
 * Destiné au développement et à la démonstration uniquement.
 */
import { createPrismaClient } from "../src/database/prisma.js";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const excludeEmails = new Set(
  args
    .filter((a) => a.startsWith("--exclude="))
    .flatMap((a) => a.slice("--exclude=".length).split(","))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const email = (positional[0] ?? process.env.LINK_EMAIL ?? "").trim().toLowerCase();

if (!email) {
  console.error("Usage : tsx scripts/link-customer.ts <email> [--exclude=autre@email.fr,...]");
  process.exit(1);
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`Adresse invalide : ${email}`);
  process.exit(1);
}

const prisma = createPrismaClient();

async function main(): Promise<void> {
  const existing = await prisma.customer.findUnique({
    where: { email },
    select: { id: true, customerNumber: true, firstName: true, lastName: true },
  });

  if (existing) {
    console.log(`Cette adresse est déjà rattachée au client ${existing.customerNumber}.`);
    await report(existing.id);
    return;
  }

  // Le client le plus fourni : c'est celui qui rendra les tests les plus parlants.
  // --exclude retire les clients déjà rattachés à un autre compte de démo,
  // sinon deux appels successifs se disputeraient le même client (le plus
  // fourni) et le second écraserait le rattachement du premier.
  const candidates = await prisma.customer.findMany({
    where: excludeEmails.size > 0 ? { email: { notIn: [...excludeEmails] } } : undefined,
    select: {
      id: true,
      customerNumber: true,
      firstName: true,
      lastName: true,
      email: true,
      _count: { select: { orders: true } },
    },
  });

  if (candidates.length === 0) {
    console.error(
      "Aucun client disponible (base vide, ou tous exclus). Lancer le générateur de données :\n" +
        "  pnpm --filter @egobot/logistics-agent exec tsx prisma/seed.ts",
    );
    process.exit(1);
  }

  const target = candidates.sort((a, b) => b._count.orders - a._count.orders)[0]!;

  await prisma.customer.update({
    where: { id: target.id },
    data: { email, isActive: true },
  });

  console.log(
    `Adresse ${email} rattachée à ${target.firstName} ${target.lastName} ` +
      `(${target.customerNumber}), qui portait ${target.email}.`,
  );
  await report(target.id);
}

/** Affiche de quoi formuler des questions qui aboutissent. */
async function report(customerId: string): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      orderNumber: true,
      status: true,
      deliveries: { select: { deliveryNumber: true, status: true }, take: 2 },
    },
  });

  const total = await prisma.order.count({ where: { customerId } });

  console.log(`\n${total} commande(s) rattachée(s). Les plus récentes :\n`);
  for (const order of orders) {
    console.log(`  ${order.orderNumber}  ${order.status}`);
    for (const delivery of order.deliveries) {
      console.log(`      livraison ${delivery.deliveryNumber}  ${delivery.status}`);
    }
  }

  if (orders[0]) {
    console.log(
      `\nÀ essayer en mode « Suivi commandes » :\n` +
        `  « Où en est ma commande ${orders[0].orderNumber} ? »\n` +
        `  « Quelle est ma dernière commande ? »`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
