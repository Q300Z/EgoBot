import { describe, expect, it, vi } from "vitest";
import type { LogisticsPrismaClient } from "../database/index.js";
import { createLogisticsTools } from "./create-logistics-tools.js";

describe("createLogisticsTools", () => {
  it("expose les lectures client et les intentions logistiques spécialisées", () => {
    const prisma = {
      customer: { findUnique: vi.fn() },
      order: { findFirst: vi.fn() },
      delivery: { findFirst: vi.fn() },
      product: { findFirst: vi.fn() },
    } as unknown as LogisticsPrismaClient;

    const tools = createLogisticsTools({
      customer: {
        customerId: "7ca2c025-ea9b-4d7e-8920-c4f5bc93a26f",
        email: "client@example.com",
      },
      prisma,
    });

    expect(tools.map(({ name }) => name)).toEqual([
      "get_customer_profile",
      "get_customer_identity",
      "get_customer_current_address",
      "get_order_status",
      "get_order_details",
      "get_last_order",
      "get_delivery_tracking",
      "get_product_availability",
    ]);

    const customerProfileTool = tools[0];
    expect(Object.keys(customerProfileTool.schema.shape)).toEqual([]);

    const orderStatusTool = tools[3];
    expect(Object.keys(orderStatusTool.schema.shape)).toEqual([
      "orderNumber",
    ]);

    const lastOrderTool = tools[5];
    expect(Object.keys(lastOrderTool.schema.shape)).toEqual([]);
  });

  it("capture le customerId serveur dans les outils client", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = {
      customer: { findUnique },
      order: { findFirst: vi.fn() },
      delivery: { findFirst: vi.fn() },
      product: { findFirst: vi.fn() },
    } as unknown as LogisticsPrismaClient;

    const tools = createLogisticsTools({
      customer: {
        customerId: "7ca2c025-ea9b-4d7e-8920-c4f5bc93a26f",
        email: "client@example.com",
      },
      prisma,
    });

    await (
      tools[0] as {
        invoke(input: Record<string, never>): Promise<unknown>;
      }
    ).invoke({});

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "7ca2c025-ea9b-4d7e-8920-c4f5bc93a26f",
        },
      }),
    );
  });

  it("récupère la dernière commande avec le customerId serveur", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      customer: { findUnique: vi.fn() },
      order: { findFirst },
      delivery: { findFirst: vi.fn() },
      product: { findFirst: vi.fn() },
    } as unknown as LogisticsPrismaClient;

    const tools = createLogisticsTools({
      customer: {
        customerId: "7ca2c025-ea9b-4d7e-8920-c4f5bc93a26f",
        email: "client@example.com",
      },
      prisma,
    });

    await (
      tools[5] as {
        invoke(input: Record<string, never>): Promise<unknown>;
      }
    ).invoke({});

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId: "7ca2c025-ea9b-4d7e-8920-c4f5bc93a26f",
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
      }),
    );
  });

  it("refuse une identité client invalide avant de créer les outils", () => {
    const prisma = {} as LogisticsPrismaClient;

    expect(() =>
      createLogisticsTools({
        customer: {
          customerId: "pas-un-uuid",
          email: "client@example.com",
        },
        prisma,
      }),
    ).toThrow();
  });
});
