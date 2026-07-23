import type { LogisticsPrismaClient } from "../database/index.js";
import {
  notFound,
  orderDetailsResultSchema,
  orderStatusResultSchema,
  type OrderDetailsResultDto,
  type OrderStatusResultDto,
} from "../dtos/index.js";
import { decimalToString, toIsoString } from "./serialization.js";

const deliverySelect = {
  deliveryNumber: true,
  status: true,
  carrierName: true,
  trackingNumber: true,
  trackingUrl: true,
  plannedShipmentAt: true,
  shippedAt: true,
  estimatedDeliveryAt: true,
  deliveredAt: true,
} as const;

function mapDelivery(delivery: {
  deliveryNumber: string;
  status:
    | "PLANNED"
    | "PREPARING"
    | "READY"
    | "IN_TRANSIT"
    | "DELIVERED"
    | "FAILED"
    | "RETURNED"
    | "CANCELLED";
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  plannedShipmentAt: Date | null;
  shippedAt: Date | null;
  estimatedDeliveryAt: Date | null;
  deliveredAt: Date | null;
}) {
  return {
    ...delivery,
    plannedShipmentAt: toIsoString(delivery.plannedShipmentAt),
    shippedAt: toIsoString(delivery.shippedAt),
    estimatedDeliveryAt: toIsoString(delivery.estimatedDeliveryAt),
    deliveredAt: toIsoString(delivery.deliveredAt),
  };
}

export class OrderQueryService {
  constructor(private readonly prisma: LogisticsPrismaClient) {}

  async getStatus(
    customerId: string,
    orderNumber: string,
  ): Promise<OrderStatusResultDto> {
    const order = await this.prisma.order.findFirst({
      where: { customerId, orderNumber },
      select: {
        orderNumber: true,
        status: true,
        orderedAt: true,
        requestedDeliveryDate: true,
        totalIncludingTax: true,
        currencyCode: true,
        deliveries: {
          select: deliverySelect,
          orderBy: { createdAt: "asc" },
          take: 50,
        },
      },
    });

    if (!order) {
      return notFound("Commande introuvable pour le client authentifié.");
    }

    return orderStatusResultSchema.parse({
      found: true,
      order: {
        ...order,
        orderedAt: toIsoString(order.orderedAt),
        requestedDeliveryDate: toIsoString(order.requestedDeliveryDate),
        totalIncludingTax: decimalToString(order.totalIncludingTax),
        deliveries: order.deliveries.map(mapDelivery),
      },
    });
  }

  async getDetails(
    customerId: string,
    orderNumber: string,
  ): Promise<OrderDetailsResultDto> {
    const order = await this.prisma.order.findFirst({
      where: { customerId, orderNumber },
      select: {
        orderNumber: true,
        status: true,
        orderedAt: true,
        requestedDeliveryDate: true,
        currencyCode: true,
        subtotalAmount: true,
        discountAmount: true,
        shippingAmount: true,
        taxAmount: true,
        totalExcludingTax: true,
        totalIncludingTax: true,
        paidAmount: true,
        refundedAmount: true,
        amountDue: true,
        lines: {
          select: {
            lineNumber: true,
            skuSnapshot: true,
            nameSnapshot: true,
            orderedQuantity: true,
            price: {
              select: {
                currencyCode: true,
                unitPriceExcludingTax: true,
                discountAmount: true,
                taxRate: true,
                lineTotalExcludingTax: true,
                lineTotalIncludingTax: true,
              },
            },
            deliveryLines: {
              where: {
                delivery: {
                  status: {
                    notIn: ["CANCELLED", "FAILED", "RETURNED"],
                  },
                },
              },
              select: { shippedQuantity: true },
            },
          },
          orderBy: { lineNumber: "asc" },
          take: 100,
        },
        deliveries: {
          select: deliverySelect,
          orderBy: { createdAt: "asc" },
          take: 50,
        },
      },
    });

    if (!order) {
      return notFound("Commande introuvable pour le client authentifié.");
    }

    return orderDetailsResultSchema.parse({
      found: true,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        orderedAt: toIsoString(order.orderedAt),
        requestedDeliveryDate: toIsoString(order.requestedDeliveryDate),
        currencyCode: order.currencyCode,
        amounts: {
          subtotal: decimalToString(order.subtotalAmount),
          discount: decimalToString(order.discountAmount),
          shipping: decimalToString(order.shippingAmount),
          tax: decimalToString(order.taxAmount),
          totalExcludingTax: decimalToString(order.totalExcludingTax),
          totalIncludingTax: decimalToString(order.totalIncludingTax),
          paid: decimalToString(order.paidAmount),
          refunded: decimalToString(order.refundedAmount),
          due: decimalToString(order.amountDue),
        },
        lines: order.lines.map((line: {
          lineNumber: number;
          skuSnapshot: string;
          nameSnapshot: string;
          orderedQuantity: number;
          price: {
            currencyCode: string;
            unitPriceExcludingTax: { toString(): string };
            discountAmount: { toString(): string };
            taxRate: { toString(): string };
            lineTotalExcludingTax: { toString(): string };
            lineTotalIncludingTax: { toString(): string };
          };
          deliveryLines: Array<{ shippedQuantity: number }>;
        }) => {
          const shippedQuantity = line.deliveryLines.reduce(
            (
              total: number,
              deliveryLine: { shippedQuantity: number },
            ) =>
              total + deliveryLine.shippedQuantity,
            0,
          );

          return {
            lineNumber: line.lineNumber,
            sku: line.skuSnapshot,
            name: line.nameSnapshot,
            orderedQuantity: line.orderedQuantity,
            shippedQuantity,
            remainingQuantity: Math.max(
              line.orderedQuantity - shippedQuantity,
              0,
            ),
            currencyCode: line.price.currencyCode,
            unitPriceExcludingTax: decimalToString(
              line.price.unitPriceExcludingTax,
            ),
            discountAmount: decimalToString(line.price.discountAmount),
            taxRate: decimalToString(line.price.taxRate),
            lineTotalExcludingTax: decimalToString(
              line.price.lineTotalExcludingTax,
            ),
            lineTotalIncludingTax: decimalToString(
              line.price.lineTotalIncludingTax,
            ),
          };
        }),
        deliveries: order.deliveries.map(mapDelivery),
      },
    });
  }
}
