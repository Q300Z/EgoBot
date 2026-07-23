import { describe, expect, it, vi } from "vitest";
import type { LogisticsPrismaClient } from "../database/index.js";
import { createLogisticsTools } from "./create-logistics-tools.js";

describe("createLogisticsTools", () => {
  it("expose uniquement les quatre intentions métier prévues", () => {
    const prisma = {
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
      "get_order_status",
      "get_order_details",
      "get_delivery_tracking",
      "get_product_availability",
    ]);

    const orderStatusTool = tools[0];
    expect(Object.keys(orderStatusTool.schema.shape)).toEqual([
      "orderNumber",
    ]);
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
