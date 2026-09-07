import { describe, expect, it, vi } from "vitest";
import type { LogisticsPrismaClient } from "../database/index.js";
import {
  CustomerService,
  DeliveryQueryService,
  InventoryQueryService,
  OrderService,
} from "./index.js";

const customerId = "7ca2c025-ea9b-4d7e-8920-c4f5bc93a26f";
const addressId = "9f4c52d6-2447-4618-a394-3f67e88772cf";
const shippingAddressId = "8cb5425a-987d-4c77-9d27-a38cdb936e82";
const orderId = "51743adb-3fd8-43ef-a7d6-bbed94cab27b";
const customerFixture = {
  id: customerId,
  customerNumber: "CLI-0042",
  firstName: "Alice",
  lastName: "Martin",
  email: "client@example.com",
  phone: "+33102030405",
  isActive: true,
  createdAt: new Date("2026-01-02T10:00:00.000Z"),
  updatedAt: new Date("2026-07-22T11:30:00.000Z"),
  currentAddress: {
    id: addressId,
    status: "ACTIVE",
    label: "Domicile",
    line1: "42 rue du Test",
    line2: null,
    postalCode: "75001",
    city: "Paris",
    stateOrProvince: null,
    countryCode: "FR",
    lockedAt: null,
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    updatedAt: new Date("2026-06-15T09:00:00.000Z"),
  },
};

const orderFixture = {
  id: orderId,
  orderNumber: "CMD-2026-0042",
  customerId,
  billingAddressId: addressId,
  shippingAddressId,
  status: "CONFIRMED",
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
  createdAt: new Date("2026-07-20T10:00:00.000Z"),
  updatedAt: new Date("2026-07-21T08:30:00.000Z"),
};

describe("services de requête logistique", () => {
  it("limite la recherche d'une commande au client authentifié", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      order: { findFirst },
    } as unknown as LogisticsPrismaClient;

    const result = await new OrderService(prisma).getStatus(
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

    const result = await new OrderService(prisma).getDetails(
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

describe("OrderService", () => {
  it("retourne tous les champs scalaires cohérents avec Prisma", async () => {
    const findUnique = vi.fn().mockResolvedValue(orderFixture);
    const prisma = {
      order: { findUnique },
    } as unknown as LogisticsPrismaClient;

    const result = await new OrderService(prisma).findById(orderId);

    expect(result).toEqual({
      found: true,
      order: {
        id: orderId,
        orderNumber: "CMD-2026-0042",
        customerId,
        billingAddressId: addressId,
        shippingAddressId,
        status: "CONFIRMED",
        orderedAt: "2026-07-20T10:00:00.000Z",
        requestedDeliveryDate: null,
        currencyCode: "EUR",
        amounts: {
          subtotal: "20.00",
          discount: "0.00",
          shipping: "4.00",
          tax: "4.80",
          totalExcludingTax: "24.00",
          totalIncludingTax: "28.80",
          paid: "28.80",
          refunded: "0.00",
          due: "0.00",
        },
        createdAt: "2026-07-20T10:00:00.000Z",
        updatedAt: "2026-07-21T08:30:00.000Z",
      },
    });
  });

  it("liste et pagine les commandes d'un client", async () => {
    const nextOrder = {
      ...orderFixture,
      id: "8dd2b6f2-5346-4fb9-b925-d8924e22430d",
      orderNumber: "CMD-2026-0043",
    };
    const findMany = vi
      .fn()
      .mockResolvedValue([orderFixture, nextOrder]);
    const prisma = {
      order: { findMany },
    } as unknown as LogisticsPrismaClient;

    const result = await new OrderService(prisma).listByCustomer(
      customerId,
      {
        status: "CONFIRMED",
        query: "0042",
        limit: 1,
      },
    );

    expect(result.orders).toHaveLength(1);
    expect(result.nextCursor).toBe(orderId);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId,
          status: "CONFIRMED",
          orderNumber: {
            contains: "0042",
            mode: "insensitive",
          },
        },
        take: 2,
      }),
    );
  });

  it("récupère la dernière commande du client sans demander de numéro", async () => {
    const findFirst = vi.fn().mockResolvedValue(orderFixture);
    const prisma = {
      order: { findFirst },
    } as unknown as LogisticsPrismaClient;

    const result = await new OrderService(
      prisma,
    ).findLastForCustomer(customerId);

    expect(result.found).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
      }),
    );
    expect(findFirst.mock.calls[0]?.[0].where).not.toHaveProperty(
      "orderNumber",
    );
  });

  it("n'expose aucune méthode de modification", () => {
    const methods = Object.getOwnPropertyNames(OrderService.prototype);

    expect(methods).not.toEqual(
      expect.arrayContaining([
        "create",
        "update",
        "setStatus",
        "setAddresses",
        "cancel",
        "delete",
        "deleteDraft",
      ]),
    );
  });
});

describe("CustomerService", () => {
  it("retourne le profil et sérialise son adresse unique", async () => {
    const findUnique = vi.fn().mockResolvedValue(customerFixture);
    const prisma = {
      customer: { findUnique },
    } as unknown as LogisticsPrismaClient;

    const result = await new CustomerService(prisma).findById(customerId);

    expect(result).toEqual({
      found: true,
      customer: {
        ...customerFixture,
        createdAt: "2026-01-02T10:00:00.000Z",
        updatedAt: "2026-07-22T11:30:00.000Z",
        currentAddress: {
          ...customerFixture.currentAddress,
          lockedAt: null,
          createdAt: "2026-01-02T10:00:00.000Z",
          updatedAt: "2026-06-15T09:00:00.000Z",
        },
      },
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: customerId } }),
    );
  });

  it("retourne l'adresse courante en lecture seule", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      currentAddress: customerFixture.currentAddress,
    });
    const prisma = {
      customer: { findUnique },
    } as unknown as LogisticsPrismaClient;

    const result = await new CustomerService(prisma).getCurrentAddress(
      customerId,
    );

    expect(result).toEqual({
      found: true,
      address: {
        ...customerFixture.currentAddress,
        lockedAt: null,
        createdAt: "2026-01-02T10:00:00.000Z",
        updatedAt: "2026-06-15T09:00:00.000Z",
      },
    });
  });

  it("n'expose aucune méthode de modification", () => {
    const methods = Object.getOwnPropertyNames(CustomerService.prototype);

    expect(methods).not.toEqual(
      expect.arrayContaining([
        "create",
        "update",
        "updateIdentity",
        "setCurrentAddress",
        "clearCurrentAddress",
        "activate",
        "deactivate",
        "delete",
      ]),
    );
  });

  it("ne duplique aucune méthode commande, livraison ou stock", () => {
    const methods = Object.getOwnPropertyNames(CustomerService.prototype);

    expect(methods).not.toEqual(
      expect.arrayContaining([
        "getOrderStatus",
        "getOrderDetails",
        "getDeliveryTracking",
        "getProductAvailability",
      ]),
    );
  });
});
