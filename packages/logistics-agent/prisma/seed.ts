/**
 * Générateur de jeu de données logistique — EgoBot
 *
 * Lancement :  pnpm db:seed      (ou  npx tsx prisma/seed.ts)
 *
 * ── Méthode ────────────────────────────────────────────────────────
 *  1. Purge des tables dans l'ordre inverse des dépendances.
 *  2. Construction de TOUT le jeu en mémoire, sans aucun accès base.
 *     Les UUID sont générés ici, ce qui permet de relier les objets
 *     entre eux avant leur insertion.
 *  3. Écriture groupée, parents avant enfants.
 *  4. Relecture de la base et contrôle des invariants.
 *
 * ── Invariants garantis ────────────────────────────────────────────
 *  A. Order.subtotalAmount      = Σ OrderLinePrice.lineTotalExcludingTax
 *  B. Order.totalIncludingTax   = totalExcludingTax + taxAmount
 *  C. StockItem.onHandQuantity  = Σ quantityDelta des mouvements PHYSIQUES
 *                                 (RECEIPT, SHIPMENT, ADJUSTMENT, RETURN)
 *  D. StockItem.reservedQuantity= Σ quantityDelta des mouvements LOGIQUES
 *                                 (RESERVATION, RELEASE)
 *  E. StockItem.availableQuantity = onHand - reserved
 *  F. Σ DeliveryLine.shippedQuantity ≤ OrderLine.orderedQuantity
 *
 * ── Conventions monétaires ─────────────────────────────────────────
 *  Tous les calculs se font en CENTIMES entiers, puis sont convertis
 *  en chaîne à deux décimales au moment de l'écriture. Aucun flottant
 *  n'intervient dans une addition : c'est ce qui rend les totaux exacts.
 *
 *  Remise globale de commande : supposée taxée à 20 %.
 *  Frais de port : taxés à 20 %.
 */

import { PrismaClient, type AddressStatus, type AddressUsage } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { fakerFR as faker } from "@faker-js/faker";
import { randomUUID } from "node:crypto";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

faker.seed(20260723); // graine fixe → jeu de données reproductible

// ═══════════════════════════════════════════════════════════════════
//  Paramètres
// ═══════════════════════════════════════════════════════════════════

const NB_SUPPLIERS = 8;
const NB_PRODUCTS = 80;
const NB_CUSTOMERS = 50;
const NB_ORDERS = 150;

const LOCATIONS = ["WH-PARIS-A01", "WH-PARIS-B02", "WH-LYON-A01", "WH-LILLE-A01"];
const CARRIERS = ["Colissimo", "Chronopost", "DPD", "GLS", "DHL", "UPS"];
const DAYS_BACK = 240;

const SHIPPING_TAX_PCT = 20;
const DISCOUNT_TAX_PCT = 20;
const FREE_SHIPPING_THRESHOLD_CENTS = 15_000; // 150,00 €

// ═══════════════════════════════════════════════════════════════════
//  Utilitaires
// ═══════════════════════════════════════════════════════════════════

/** Convertit des centimes entiers en chaîne décimale exacte. */
const dec = (cents: number) => (cents / 100).toFixed(2);

const pad = (n: number, len: number) => String(n).padStart(len, "0");
const pick = <T>(arr: readonly T[]): T => faker.helpers.arrayElement(arr as T[]);
/** Tirage booléen pondéré. On n'utilise jamais faker.number.float : son
 *  API a changé entre les versions majeures, l'entier est stable. */
const chance = (percent: number) => faker.number.int({ min: 1, max: 100 }) <= percent;

const daysAgo = (d: number) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  date.setHours(faker.number.int({ min: 8, max: 18 }), faker.number.int({ min: 0, max: 59 }), 0, 0);
  return date;
};

const addDays = (date: Date, d: number) => {
  const out = new Date(date);
  out.setDate(out.getDate() + d);
  return out;
};

// ═══════════════════════════════════════════════════════════════════
//  1. Purge — ordre inverse des dépendances
// ═══════════════════════════════════════════════════════════════════

async function purge() {
  await prisma.stockMovement.deleteMany();
  await prisma.stockItem.deleteMany();
  await prisma.deliveryLine.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.orderLine.deleteMany();
  await prisma.orderLinePrice.deleteMany();
  await prisma.order.deleteMany();
  await prisma.supplierProduct.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany(); // en dernier : référencée par tout le reste
  console.log("Tables vidées.");
}

// ═══════════════════════════════════════════════════════════════════
//  2. Adresses
// ═══════════════════════════════════════════════════════════════════

type AddressRow = {
  id: string;
  status: AddressStatus;
  usage: AddressUsage;
  label: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  stateOrProvince: string | null;
  countryCode: string;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const addresses: AddressRow[] = [];

/** Fabrique une adresse. Les adresses LOCKED sont celles gelées au moment
 *  d'une commande : elles ne doivent plus jamais être modifiées. */
function makeAddress(opts: {
  usage: AddressUsage;
  status?: AddressStatus;
  label?: string | null;
  when?: Date;
  copyOf?: AddressRow;
}): AddressRow {
  const when = opts.when ?? daysAgo(faker.number.int({ min: 1, max: DAYS_BACK }));
  const status = opts.status ?? "ACTIVE";

  const base = opts.copyOf ?? {
    line1: faker.location.streetAddress(),
    line2: chance(22) ? faker.location.secondaryAddress() : null,
    postalCode: faker.location.zipCode("#####"),
    city: faker.location.city(),
    stateOrProvince: null as string | null,
    countryCode: pick(["FR", "FR", "FR", "FR", "FR", "BE", "LU", "DE"]),
  };

  const row: AddressRow = {
    id: randomUUID(),
    status,
    usage: opts.usage,
    label: opts.label ?? null,
    line1: base.line1,
    line2: base.line2,
    postalCode: base.postalCode,
    city: base.city,
    stateOrProvince: base.stateOrProvince,
    countryCode: base.countryCode,
    lockedAt: status === "LOCKED" ? when : null,
    createdAt: when,
    updatedAt: when,
  };

  addresses.push(row);
  return row;
}

// ═══════════════════════════════════════════════════════════════════
//  3. Fournisseurs
// ═══════════════════════════════════════════════════════════════════

function buildSuppliers() {
  return Array.from({ length: NB_SUPPLIERS }, (_, i) => {
    const address = makeAddress({ usage: "SUPPLIER", label: "Siège" });
    return {
      id: randomUUID(),
      supplierCode: `FRN-${pad(i + 1, 6)}`,
      name: faker.company.name(),
      contactEmail: chance(85) ? faker.internet.email({ provider: "fournisseur.fr" }).toLowerCase() : null,
      phone: chance(80) ? faker.phone.number() : null,
      currentAddressId: address.id,
      // cas limite forcé : le dernier fournisseur est désactivé
      isActive: i !== NB_SUPPLIERS - 1,
      createdAt: address.createdAt,
      updatedAt: address.createdAt,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
//  4. Articles
// ═══════════════════════════════════════════════════════════════════

const CATEGORIES = [
  "Carton", "Palette", "Film étirable", "Ruban adhésif", "Sangle",
  "Étiquette", "Bac plastique", "Housse", "Coussin de calage", "Cerclage",
  "Diable", "Transpalette", "Gant", "Cutter", "Caisse bois",
];

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Hors schéma : sert au calcul des lignes de commande. */
  priceCents: number;
  /** Hors schéma : taux de TVA applicable. */
  taxRatePct: number;
};

function buildProducts(): ProductRow[] {
  return Array.from({ length: NB_PRODUCTS }, (_, i) => {
    const when = daysAgo(faker.number.int({ min: 60, max: DAYS_BACK }));
    return {
      id: randomUUID(),
      sku: `SKU-${pad(i + 1, 5)}`,
      name: `${pick(CATEGORIES)} ${faker.commerce.productAdjective()} ${faker.number.int({ min: 10, max: 999 })}`,
      description: chance(70) ? faker.commerce.productDescription() : null,
      // cas limite forcé : trois articles au catalogue mais désactivés
      isActive: i >= 3,
      createdAt: when,
      updatedAt: when,
      priceCents: faker.number.int({ min: 120, max: 24_000 }),
      // quelques articles à taux réduit, pour que le calcul de TVA ne soit
      // pas trivialement uniforme
      taxRatePct: chance(12) ? 5.5 : 20,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
//  5. Conditions d'approvisionnement
// ═══════════════════════════════════════════════════════════════════

function buildSupplierProducts(suppliers: ReturnType<typeof buildSuppliers>, products: ProductRow[]) {
  const rows: any[] = [];
  const active = suppliers.filter((s) => s.isActive);

  products.forEach((product, index) => {
    // cas limite forcé : les quatre premiers articles n'ont aucun fournisseur
    if (index < 4) return;

    const chosen = faker.helpers.arrayElements(active, faker.number.int({ min: 1, max: 3 }));

    chosen.forEach((supplier, rank) => {
      const when = daysAgo(faker.number.int({ min: 30, max: DAYS_BACK }));
      rows.push({
        id: randomUUID(),
        supplierId: supplier.id,
        productId: product.id,
        supplierSku: chance(60)
          ? `${supplier.supplierCode.slice(-4)}-${faker.string.alphanumeric({ length: 6, casing: "upper" })}`
          : null,
        // prix d'achat : 45 à 70 % du prix de vente
        purchasePrice: dec(Math.round((product.priceCents * faker.number.int({ min: 45, max: 70 })) / 100)),
        currencyCode: "EUR",
        leadTimeDays: chance(85) ? pick([2, 3, 5, 7, 7, 10, 14, 21, 30]) : null,
        minimumOrderQuantity: pick([1, 1, 1, 10, 25, 50, 100]),
        isPreferred: rank === 0, // un seul fournisseur privilégié par article
        createdAt: when,
        updatedAt: when,
      });
    });
  });

  return rows;
}

// ═══════════════════════════════════════════════════════════════════
//  6. Clients
// ═══════════════════════════════════════════════════════════════════

type CustomerRow = {
  id: string;
  customerNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  currentAddressId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Hors schéma : l'adresse courante, pour en dériver les gels. */
  address: AddressRow;
};

function buildCustomers(): CustomerRow[] {
  const seenEmails = new Set<string>();

  return Array.from({ length: NB_CUSTOMERS }, (_, i) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const when = daysAgo(faker.number.int({ min: 30, max: DAYS_BACK }));

    // email @unique : l'unicité est garantie explicitement, jamais par chance
    let email = faker.internet.email({ firstName, lastName }).toLowerCase();
    while (seenEmails.has(email)) email = `${i}.${email}`;
    seenEmails.add(email);

    const address = makeAddress({ usage: "CUSTOMER", label: "Domicile", when });

    // certains clients ont une ancienne adresse archivée : c'est ce que
    // le versionnement d'adresse est censé permettre
    if (chance(30)) {
      makeAddress({ usage: "CUSTOMER", status: "ARCHIVED", label: "Ancienne adresse", when: addDays(when, -90) });
    }

    return {
      id: randomUUID(),
      customerNumber: `CLI-${pad(i + 1, 6)}`,
      firstName,
      lastName,
      email,
      phone: chance(80) ? faker.phone.number() : null,
      currentAddressId: address.id,
      // cas limite forcé : trois clients désactivés qui gardent leur historique
      isActive: i >= 3,
      createdAt: when,
      updatedAt: when,
      address,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
//  7. Commandes, prix, lignes, livraisons
// ═══════════════════════════════════════════════════════════════════

/** Répartition réaliste des états de commande. Une distribution uniforme
 *  donnerait autant de brouillons que de commandes livrées, ce qui ne
 *  ressemble à aucune activité réelle. */
const STATUS_WEIGHTS: Record<string, number> = {
  DRAFT: 5,
  CONFIRMED: 12,
  PROCESSING: 13,
  PARTIALLY_SHIPPED: 11,
  SHIPPED: 13,
  DELIVERED: 40,
  CANCELLED: 6,
};

const STATUS_BAG: string[] = Object.entries(STATUS_WEIGHTS).flatMap(([s, w]) => Array(w).fill(s));

function buildOrders(customers: CustomerRow[], products: ProductRow[]) {
  const orders: any[] = [];
  const prices: any[] = [];
  const orderLines: any[] = [];
  const deliveries: any[] = [];
  const deliveryLines: any[] = [];

  const sellable = products.filter((p) => p.isActive);

  for (let i = 0; i < NB_ORDERS; i++) {
    const customer = pick(customers);
    const status = pick(STATUS_BAG);
    const orderId = randomUUID();

    const createdDay = faker.number.int({ min: 1, max: DAYS_BACK - 20 });
    const createdAt = daysAgo(createdDay);
    const orderedAt = status === "DRAFT" ? null : createdAt;

    // ── adresses gelées au moment de la commande ──
    // C'est le rôle de AddressStatus.LOCKED : figer l'adresse pour que
    // l'historique reste exact même si le client déménage ensuite.
    const lockedStatus = status === "DRAFT" ? "DRAFT" : "LOCKED";
    const billing = makeAddress({
      usage: "BILLING", status: lockedStatus, label: "Facturation",
      when: createdAt, copyOf: customer.address,
    });
    const shipping = makeAddress({
      usage: "SHIPPING", status: lockedStatus, label: "Livraison",
      when: createdAt,
      // une commande sur cinq est livrée à une adresse différente
      copyOf: chance(80) ? customer.address : undefined,
    });

    // ── lignes et prix ──
    const nbLines = faker.number.int({ min: 1, max: 6 });
    const chosen = faker.helpers.arrayElements(sellable, nbLines);

    let subtotalCents = 0;
    let linesTaxCents = 0;
    const linesForThisOrder: { id: string; orderedQuantity: number; sku: string }[] = [];

    chosen.forEach((product, index) => {
      const orderedQuantity = faker.number.int({ min: 1, max: 30 });
      const grossCents = product.priceCents * orderedQuantity;

      // remise de ligne occasionnelle, exprimée en pourcentage entier
      const lineDiscountCents = chance(18)
        ? Math.round((grossCents * pick([5, 10, 15, 20])) / 100)
        : 0;

      const lineHtCents = grossCents - lineDiscountCents;
      const lineTaxCents = Math.round((lineHtCents * product.taxRatePct) / 100);
      const lineTtcCents = lineHtCents + lineTaxCents;

      subtotalCents += lineHtCents;
      linesTaxCents += lineTaxCents;

      const priceId = randomUUID();
      prices.push({
        id: priceId,
        currencyCode: "EUR",
        unitPriceExcludingTax: dec(product.priceCents),
        discountAmount: dec(lineDiscountCents),
        taxRate: product.taxRatePct.toFixed(2),
        taxAmount: dec(lineTaxCents),
        lineTotalExcludingTax: dec(lineHtCents),
        lineTotalIncludingTax: dec(lineTtcCents),
        frozenAt: createdAt,
      });

      const lineId = randomUUID();
      orderLines.push({
        id: lineId,
        orderId,
        priceId,
        productId: product.id,
        lineNumber: index + 1,
        skuSnapshot: product.sku,
        nameSnapshot: product.name,
        orderedQuantity,
        createdAt,
        updatedAt: createdAt,
      });

      linesForThisOrder.push({ id: lineId, orderedQuantity, sku: product.sku });
    });

    // ── totaux de la commande ──
    const orderDiscountCents = chance(12) ? Math.round((subtotalCents * pick([5, 10])) / 100) : 0;
    const shippingCents =
      subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : pick([490, 690, 990, 1490]);

    const taxCents =
      linesTaxCents
      + Math.round((shippingCents * SHIPPING_TAX_PCT) / 100)
      - Math.round((orderDiscountCents * DISCOUNT_TAX_PCT) / 100);

    const totalHtCents = subtotalCents - orderDiscountCents + shippingCents;
    const totalTtcCents = totalHtCents + taxCents;

    // ── règlement, cohérent avec l'état de la commande ──
    let paidCents = 0;
    let refundedCents = 0;

    if (status === "DELIVERED" || status === "SHIPPED" || status === "PARTIALLY_SHIPPED") {
      paidCents = totalTtcCents;
    } else if (status === "PROCESSING" || status === "CONFIRMED") {
      // acompte dans un cas sur trois, sinon rien de versé
      paidCents = chance(35) ? Math.round(totalTtcCents / 2) : 0;
    } else if (status === "CANCELLED") {
      // annulation après paiement : intégralement remboursée
      if (chance(50)) {
        paidCents = totalTtcCents;
        refundedCents = totalTtcCents;
      }
    }

    // Règle métier : une commande annulée ne présente plus de solde dû.
    const dueCents = status === "CANCELLED"
      ? 0
      : Math.max(0, totalTtcCents - paidCents + refundedCents);

    orders.push({
      id: orderId,
      orderNumber: `CMD-2026-${pad(i + 1, 6)}`,
      customerId: customer.id,
      billingAddressId: billing.id,
      shippingAddressId: shipping.id,
      status,
      orderedAt,
      requestedDeliveryDate: chance(75)
        ? addDays(createdAt, faker.number.int({ min: 2, max: 21 }))
        : null,
      currencyCode: "EUR",
      subtotalAmount: dec(subtotalCents),
      discountAmount: dec(orderDiscountCents),
      shippingAmount: dec(shippingCents),
      taxAmount: dec(taxCents),
      totalExcludingTax: dec(totalHtCents),
      totalIncludingTax: dec(totalTtcCents),
      paidAmount: dec(paidCents),
      refundedAmount: dec(refundedCents),
      amountDue: dec(dueCents),
      createdAt,
      updatedAt: createdAt,
    });

    // ── livraisons ──
    if (status === "DRAFT" || status === "CONFIRMED" || status === "CANCELLED") continue;

    const shipEverything = status === "SHIPPED" || status === "DELIVERED";
    const nbDeliveries = status === "PARTIALLY_SHIPPED" ? 1 : chance(20) ? 2 : 1;

    // le compteur du reste à expédier interdit structurellement
    // d'expédier plus que ce qui a été commandé
    const remaining = new Map(linesForThisOrder.map((l) => [l.id, l.orderedQuantity]));

    for (let d = 0; d < nbDeliveries; d++) {
      const isLast = d === nbDeliveries - 1;
      const deliveryId = randomUUID();
      const shippedDay = Math.max(1, createdDay - faker.number.int({ min: 1, max: 8 }));
      const shippedAt = daysAgo(shippedDay);

      let deliveryStatus: string;
      let deliveredAt: Date | null = null;

      if (status === "PROCESSING") {
        deliveryStatus = pick(["PLANNED", "PREPARING", "READY"]);
      } else if (status === "PARTIALLY_SHIPPED" || status === "SHIPPED") {
        deliveryStatus = "IN_TRANSIT";
      } else {
        // DELIVERED : on force une part d'échecs et de retours, sans quoi
        // les états FAILED et RETURNED ne seraient jamais représentés
        const roll = faker.number.int({ min: 1, max: 100 });
        if (roll <= 7) deliveryStatus = "FAILED";
        else if (roll <= 11) deliveryStatus = "RETURNED";
        else {
          deliveryStatus = "DELIVERED";
          deliveredAt = addDays(shippedAt, faker.number.int({ min: 1, max: 6 }));
        }
      }

      const hasLeft = deliveryStatus !== "PLANNED" && deliveryStatus !== "PREPARING";

      deliveries.push({
        id: deliveryId,
        deliveryNumber: `LIV-2026-${pad(deliveries.length + 1, 6)}`,
        orderId,
        addressId: shipping.id, // la livraison réutilise l'adresse gelée
        status: deliveryStatus,
        carrierName: hasLeft ? pick(CARRIERS) : null,
        trackingNumber: hasLeft ? faker.string.alphanumeric({ length: 13, casing: "upper" }) : null,
        trackingUrl: null,
        plannedShipmentAt: addDays(createdAt, 1),
        shippedAt: hasLeft ? shippedAt : null,
        estimatedDeliveryAt: hasLeft ? addDays(shippedAt, faker.number.int({ min: 1, max: 6 })) : null,
        deliveredAt,
        createdAt: shippedAt,
        updatedAt: shippedAt,
      });

      for (const line of linesForThisOrder) {
        const left = remaining.get(line.id) ?? 0;
        if (left <= 0) continue;

        let qty: number;
        if (shipEverything && isLast) {
          qty = left;
        } else if (status === "PARTIALLY_SHIPPED") {
          qty = Math.max(1, Math.floor((left * faker.number.int({ min: 30, max: 70 })) / 100));
        } else {
          qty = isLast ? left : Math.max(1, Math.floor(left / 2));
        }

        remaining.set(line.id, left - qty);

        deliveryLines.push({
          id: randomUUID(),
          deliveryId,
          orderLineId: line.id,
          shippedQuantity: qty,
          createdAt: shippedAt,
        });
      }
    }
  }

  return { orders, prices, orderLines, deliveries, deliveryLines };
}

// ═══════════════════════════════════════════════════════════════════
//  8. Stock et journal des mouvements
// ═══════════════════════════════════════════════════════════════════
//
//  Construction à l'envers : on décide d'abord la quantité finale
//  voulue, puis on fabrique un historique plausible, puis une écriture
//  d'ajustement comble l'écart. La somme du journal vaut alors
//  exactement la quantité affichée, par construction.
//
//  Le journal tient deux comptes distincts :
//    - mouvements PHYSIQUES  → alimentent onHandQuantity
//    - mouvements LOGIQUES   → alimentent reservedQuantity
//
const PHYSICAL = ["RECEIPT", "SHIPMENT", "ADJUSTMENT", "RETURN"];
const LOGICAL = ["RESERVATION", "RELEASE"];

function buildStock(products: ProductRow[]) {
  const stockItems: any[] = [];
  const movements: any[] = [];

  products.forEach((product, index) => {
    const locations = faker.helpers.arrayElements(LOCATIONS, faker.number.int({ min: 1, max: 2 }));

    locations.forEach((locationCode) => {
      const safetyStockQuantity = pick([0, 5, 10, 10, 20, 50]);

      // cas limites forcés, imposés par position et non tirés au hasard :
      //   index 0-5   → rupture totale
      //   index 6-15  → sous le stock de sécurité
      let onHandTarget: number;
      if (index < 6) onHandTarget = 0;
      else if (index < 16) onHandTarget = Math.max(0, safetyStockQuantity - faker.number.int({ min: 1, max: 5 }));
      else onHandTarget = faker.number.int({ min: 20, max: 1200 });

      const trail: { type: string; delta: number; day: number }[] = [];

      // ── volet physique ──
      let balance = 0;
      const nbMoves = faker.number.int({ min: 4, max: 12 });

      for (let m = 0; m < nbMoves; m++) {
        const day = faker.number.int({ min: 1, max: DAYS_BACK });
        if (balance > 20 && chance(45)) {
          const out = faker.number.int({ min: 1, max: Math.min(balance, 60) });
          trail.push({ type: "SHIPMENT", delta: -out, day });
          balance -= out;
        } else if (balance > 5 && chance(8)) {
          const back = faker.number.int({ min: 1, max: 5 });
          trail.push({ type: "RETURN", delta: back, day });
          balance += back;
        } else {
          const inc = faker.number.int({ min: 20, max: 300 });
          trail.push({ type: "RECEIPT", delta: inc, day });
          balance += inc;
        }
      }

      // écriture de calage : garantit l'invariant C
      const gap = onHandTarget - balance;
      if (gap !== 0) trail.push({ type: "ADJUSTMENT", delta: gap, day: 1 });

      // ── volet logique ──
      const reservedTarget = onHandTarget === 0
        ? 0
        : faker.number.int({ min: 0, max: Math.min(onHandTarget, 40) });

      let reserved = 0;
      const nbReservations = reservedTarget === 0 ? 0 : faker.number.int({ min: 1, max: 4 });

      for (let r = 0; r < nbReservations; r++) {
        const day = faker.number.int({ min: 1, max: 45 });
        const amount = faker.number.int({ min: 1, max: Math.max(1, Math.ceil(reservedTarget / 2)) });
        trail.push({ type: "RESERVATION", delta: amount, day });
        reserved += amount;

        if (reserved > reservedTarget && chance(60)) {
          const release = reserved - reservedTarget;
          trail.push({ type: "RELEASE", delta: -release, day: Math.max(1, day - 1) });
          reserved -= release;
        }
      }

      // écriture de calage logique : garantit l'invariant D
      const reservedGap = reservedTarget - reserved;
      if (reservedGap > 0) trail.push({ type: "RESERVATION", delta: reservedGap, day: 1 });
      else if (reservedGap < 0) trail.push({ type: "RELEASE", delta: reservedGap, day: 1 });

      trail
        .sort((a, b) => b.day - a.day)
        .forEach((mv) => {
          const occurredAt = daysAgo(mv.day);
          movements.push({
            id: randomUUID(),
            productId: product.id,
            locationCode,
            movementType: mv.type,
            quantityDelta: mv.delta,
            referenceType:
              mv.type === "SHIPMENT" ? "DELIVERY"
              : mv.type === "RECEIPT" ? "SUPPLIER"
              : mv.type === "RESERVATION" || mv.type === "RELEASE" ? "ORDER"
              : mv.type === "RETURN" ? "CUSTOMER_RETURN"
              : "INVENTORY",
            referenceId: null,
            reason: mv.type === "ADJUSTMENT" ? "Écart constaté lors de l'inventaire tournant" : null,
            occurredAt,
            createdAt: occurredAt,
          });
        });

      stockItems.push({
        id: randomUUID(),
        productId: product.id,
        locationCode,
        onHandQuantity: onHandTarget,
        reservedQuantity: reservedTarget,
        availableQuantity: onHandTarget - reservedTarget,
        safetyStockQuantity,
        updatedAt: new Date(),
      });
    });
  });

  return { stockItems, movements };
}

// ═══════════════════════════════════════════════════════════════════
//  9. Vérification des invariants — relecture depuis la base
// ═══════════════════════════════════════════════════════════════════

async function verify() {
  const problems: string[] = [];
  const eur = (v: any) => Math.round(Number(v) * 100);

  // A + B : cohérence monétaire des commandes
  const orders = await prisma.order.findMany({ include: { lines: { include: { price: true } } } });

  for (const order of orders) {
    const sumLines = order.lines.reduce((acc, l) => acc + eur(l.price.lineTotalExcludingTax), 0);
    if (sumLines !== eur(order.subtotalAmount)) {
      problems.push(`${order.orderNumber} : sous-total ${order.subtotalAmount} ≠ somme des lignes ${dec(sumLines)}`);
    }

    const expectedHt = eur(order.subtotalAmount) - eur(order.discountAmount) + eur(order.shippingAmount);
    if (expectedHt !== eur(order.totalExcludingTax)) {
      problems.push(`${order.orderNumber} : total HT incohérent`);
    }

    if (eur(order.totalExcludingTax) + eur(order.taxAmount) !== eur(order.totalIncludingTax)) {
      problems.push(`${order.orderNumber} : total TTC ≠ HT + TVA`);
    }
  }

  // C + D + E : cohérence du stock avec son journal
  const items = await prisma.stockItem.findMany();

  for (const item of items) {
    const physical = await prisma.stockMovement.aggregate({
      where: { productId: item.productId, locationCode: item.locationCode, movementType: { in: PHYSICAL as any } },
      _sum: { quantityDelta: true },
    });
    if ((physical._sum.quantityDelta ?? 0) !== item.onHandQuantity) {
      problems.push(`Stock ${item.locationCode} : journal physique ≠ onHandQuantity`);
    }

    const logical = await prisma.stockMovement.aggregate({
      where: { productId: item.productId, locationCode: item.locationCode, movementType: { in: LOGICAL as any } },
      _sum: { quantityDelta: true },
    });
    if ((logical._sum.quantityDelta ?? 0) !== item.reservedQuantity) {
      problems.push(`Stock ${item.locationCode} : journal logique ≠ reservedQuantity`);
    }

    if (item.onHandQuantity - item.reservedQuantity !== item.availableQuantity) {
      problems.push(`Stock ${item.locationCode} : availableQuantity incohérent`);
    }
  }

  // F : aucune sur-expédition
  const lines = await prisma.orderLine.findMany({ include: { deliveryLines: true } });

  for (const line of lines) {
    const shipped = line.deliveryLines.reduce((acc, d) => acc + d.shippedQuantity, 0);
    if (shipped > line.orderedQuantity) {
      problems.push(`Ligne ${line.skuSnapshot} : ${shipped} expédiés pour ${line.orderedQuantity} commandés`);
    }
  }

  if (problems.length) {
    console.error("\n❌ INVARIANTS VIOLÉS :");
    problems.slice(0, 15).forEach((p) => console.error("   " + p));
    if (problems.length > 15) console.error(`   ... et ${problems.length - 15} autre(s)`);
    throw new Error(`${problems.length} incohérence(s) détectée(s).`);
  }

  console.log("✅ Invariants vérifiés : montants, stock, réservations et expéditions sont cohérents.");
}

// ═══════════════════════════════════════════════════════════════════
//  Point d'entrée
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log("Génération du jeu de données EgoBot...\n");

  await purge();

  const suppliers = buildSuppliers();
  const products = buildProducts();
  const supplierProducts = buildSupplierProducts(suppliers, products);
  const customers = buildCustomers();
  const { orders, prices, orderLines, deliveries, deliveryLines } = buildOrders(customers, products);
  const { stockItems, movements } = buildStock(products);

  // Écriture : parents avant enfants, sans exception.
  await prisma.address.createMany({ data: addresses });
  await prisma.product.createMany({
    data: products.map(({ priceCents, taxRatePct, ...rest }) => rest),
  });
  await prisma.customer.createMany({
    data: customers.map(({ address, ...rest }) => rest),
  });
  await prisma.supplier.createMany({ data: suppliers });
  await prisma.supplierProduct.createMany({ data: supplierProducts });
  await prisma.order.createMany({ data: orders });
  await prisma.orderLinePrice.createMany({ data: prices });
  await prisma.orderLine.createMany({ data: orderLines });
  await prisma.delivery.createMany({ data: deliveries });
  await prisma.deliveryLine.createMany({ data: deliveryLines });
  await prisma.stockItem.createMany({ data: stockItems });
  await prisma.stockMovement.createMany({ data: movements });

  console.log(`  ${addresses.length} adresses`);
  console.log(`  ${suppliers.length} fournisseurs`);
  console.log(`  ${products.length} articles`);
  console.log(`  ${supplierProducts.length} conditions d'approvisionnement`);
  console.log(`  ${customers.length} clients`);
  console.log(`  ${orders.length} commandes / ${orderLines.length} lignes / ${prices.length} prix figés`);
  console.log(`  ${deliveries.length} livraisons / ${deliveryLines.length} lignes`);
  console.log(`  ${stockItems.length} positions de stock / ${movements.length} mouvements\n`);

  await verify();
  console.log("\nTerminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
