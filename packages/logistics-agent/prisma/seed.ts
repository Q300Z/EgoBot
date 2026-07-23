import { createPrismaClient } from "../src/database/prisma.js";

// Jeu de données minimal et documenté pour les tests manuels du chatbot
// logistique. Email, SKU et numéros métier sont volontairement fixes et
// mémorisables pour servir de scénario de test reproductible.
const CUSTOMER_EMAIL = "test.customer@egobot.dev";
const PRODUCT_SKU = "SKU-001";
const ORDER_NUMBER = "CMD-2026-0001";
const DELIVERY_NUMBER = "LIV-2026-0001";

async function main() {
  const prisma = createPrismaClient();

  const address = await prisma.address.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      usage: "CUSTOMER",
      status: "ACTIVE",
      line1: "12 rue de Test",
      postalCode: "75001",
      city: "Paris",
      countryCode: "FR",
    },
  });

  const customer = await prisma.customer.upsert({
    where: { email: CUSTOMER_EMAIL },
    update: {},
    create: {
      customerNumber: "CUST-0001",
      firstName: "Alice",
      lastName: "Testeuse",
      email: CUSTOMER_EMAIL,
      currentAddressId: address.id,
    },
  });

  const product = await prisma.product.upsert({
    where: { sku: PRODUCT_SKU },
    update: {},
    create: {
      sku: PRODUCT_SKU,
      name: "Carton d'emballage renforcé",
    },
  });

  await prisma.stockItem.upsert({
    where: {
      productId_locationCode: {
        productId: product.id,
        locationCode: "ENTREPOT-1",
      },
    },
    update: {},
    create: {
      productId: product.id,
      locationCode: "ENTREPOT-1",
      onHandQuantity: 120,
      reservedQuantity: 30,
      availableQuantity: 90,
    },
  });

  const existingOrder = await prisma.order.findUnique({
    where: { orderNumber: ORDER_NUMBER },
  });

  if (!existingOrder) {
    const orderLinePrice = await prisma.orderLinePrice.create({
      data: {
        unitPriceExcludingTax: "15.00",
        taxRate: "20.00",
        taxAmount: "45.00",
        lineTotalExcludingTax: "225.00",
        lineTotalIncludingTax: "270.00",
      },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: ORDER_NUMBER,
        customerId: customer.id,
        billingAddressId: address.id,
        shippingAddressId: address.id,
        status: "CONFIRMED",
        orderedAt: new Date("2026-07-01T09:00:00.000Z"),
        requestedDeliveryDate: new Date("2026-07-10T00:00:00.000Z"),
        subtotalAmount: "225.00",
        totalExcludingTax: "225.00",
        totalIncludingTax: "270.00",
        paidAmount: "270.00",
        amountDue: "0.00",
        lines: {
          create: [
            {
              lineNumber: 1,
              priceId: orderLinePrice.id,
              productId: product.id,
              skuSnapshot: product.sku,
              nameSnapshot: product.name,
              orderedQuantity: 15,
            },
          ],
        },
      },
      include: { lines: true },
    });

    await prisma.delivery.create({
      data: {
        deliveryNumber: DELIVERY_NUMBER,
        orderId: order.id,
        addressId: address.id,
        status: "IN_TRANSIT",
        carrierName: "Colissimo",
        trackingNumber: "TRACK-0001",
        plannedShipmentAt: new Date("2026-07-05T08:00:00.000Z"),
        shippedAt: new Date("2026-07-05T14:00:00.000Z"),
        estimatedDeliveryAt: new Date("2026-07-08T00:00:00.000Z"),
        lines: {
          create: [
            {
              orderLineId: order.lines[0]!.id,
              shippedQuantity: 10,
            },
          ],
        },
      },
    });
  }

  console.info(
    `Seed logistics-agent terminé : customer=${CUSTOMER_EMAIL}, product=${PRODUCT_SKU}, order=${ORDER_NUMBER}, delivery=${DELIVERY_NUMBER}`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
