import { describe, expect, it, vi } from "vitest";
import type { LogisticsPrismaClient } from "../database/index.js";
import {
  DeliveryQueryService,
  InventoryQueryService,
  OrderQueryService,
} from "./index.js";

const customerId = "7ca2c025-ea9b-4d7e-8920-c4f5bc93a26f";

describe("services de requête logistique", () => {
  it("limite la recherche d'une commande au client authentifié", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      order: { findFirst },
    } as unknown as LogisticsPrismaClient;

    const result = await new OrderQueryService(prisma).getStatus(
      customerId,
      "CMD-2026-0042",
    );

    expect(result).toEqual({
      found: false,
      code: "NOT_FOUND",
      message: "Commande introuvable pour le client authentifié.",
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId,
          orderNumber: "CMD-2026-0042",
        },
      }),
    );
  });

  it("sérialise les décimaux et calcule le reste à expédier", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      orderNumber: "CMD-2026-0042",
      status: "PARTIALLY_SHIPPED",
      orderedAt: new Date("2026-07-20T10:00:00.000Z"),
      requestedDeliveryDate: null,
      currencyCode: "EUR",
      subtotalAmount: "20.00",
      discountAmount: "0.00",
      shippingAmount: "4.00",
      taxAmount: "4.80",
      totalExcludingTax: "24.00",
      totalIncludingTax: "28.80",
      paidAmount: "28.80",
      refundedAmount: "0.00",
      amountDue: "0.00",
      lines: [
        {
          lineNumber: 1,
          skuSnapshot: "SKU-42",
          nameSnapshot: "Article test",
          orderedQuantity: 3,
          price: {
            currencyCode: "EUR",
            unitPriceExcludingTax: "10.00",
            discountAmount: "0.00",
            taxRate: "20.00",
            lineTotalExcludingTax: "20.00",
            lineTotalIncludingTax: "24.00",
          },
          deliveryLines: [{ shippedQuantity: 2 }],
        },
      ],
      deliveries: [],
    });
    const prisma = {
      order: { findFirst },
    } as unknown as LogisticsPrismaClient;

    const result = await new OrderQueryService(prisma).getDetails(
      customerId,
      "CMD-2026-0042",
    );

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.order.orderedAt).toBe(
        "2026-07-20T10:00:00.000Z",
      );
      expect(result.order.amounts.totalIncludingTax).toBe("28.80");
      expect(result.order.lines[0]).toMatchObject({
        shippedQuantity: 2,
        remainingQuantity: 1,
      });
    }
  });

  it("limite une livraison au client authentifié", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      delivery: { findFirst },
    } as unknown as LogisticsPrismaClient;

    await new DeliveryQueryService(prisma).getTracking(customerId, {
      trackingNumber: "TRACK-42",
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          trackingNumber: "TRACK-42",
          order: { customerId },
        },
      }),
    );
  });

  it("agrège la disponibilité sans exposer les emplacements", async () => {
    const prisma = {
      product: {
        findFirst: vi.fn().mockResolvedValue({
          sku: "SKU-42",
          name: "Article test",
          stockItems: [
            {
              onHandQuantity: 8,
              reservedQuantity: 3,
              availableQuantity: 5,
            },
            {
              onHandQuantity: 2,
              reservedQuantity: 2,
              availableQuantity: 0,
            },
          ],
        }),
      },
    } as unknown as LogisticsPrismaClient;

    const result =
      await new InventoryQueryService(prisma).getProductAvailability(
        "SKU-42",
      );

    expect(result).toEqual({
      found: true,
      product: {
        sku: "SKU-42",
        name: "Article test",
        isAvailable: true,
        onHandQuantity: 10,
        reservedQuantity: 5,
        availableQuantity: 5,
      },
    });
    expect(result).not.toHaveProperty("product.stockItems");
  });
});
