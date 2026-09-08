import type {
  Delivery,
  Order,
  Prisma,
} from "../../prisma/generated/prisma/client.js";
import type { LogisticsPrismaClient } from "../database/index.js";

import {
  orderSummaryResultSchema,
  productOrderHistoryResultSchema,
  upcomingDeliveriesResultSchema,
  type OrderSummaryResultDto,
  type ProductOrderHistoryResultDto,
  type UpcomingDeliveriesResultDto,
} from "../dtos/index.js";

import {
  notFound,
  orderDetailsResultSchema,
  orderListResultSchema,
  orderResultSchema,
  orderStatusResultSchema,
  type OrderDetailsResultDto,
  type OrderListOptions,
  type OrderListResultDto,
  type OrderResultDto,
  type OrderStatusResultDto,
} from "../dtos/index.js";
import { decimalToString, toIsoString } from "./serialization.js";

function mapOrder(order: Order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    billingAddressId: order.billingAddressId,
    shippingAddressId: order.shippingAddressId,
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
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function mapDelivery(
  delivery: Pick<
    Delivery,
    | "deliveryNumber"
    | "status"
    | "carrierName"
    | "trackingNumber"
    | "trackingUrl"
    | "plannedShipmentAt"
    | "shippedAt"
    | "estimatedDeliveryAt"
    | "deliveredAt"
  >,
) {
  return {
    deliveryNumber: delivery.deliveryNumber,
    status: delivery.status,
    carrierName: delivery.carrierName,
    trackingNumber: delivery.trackingNumber,
    trackingUrl: delivery.trackingUrl,
    plannedShipmentAt: toIsoString(delivery.plannedShipmentAt),
    shippedAt: toIsoString(delivery.shippedAt),
    estimatedDeliveryAt: toIsoString(delivery.estimatedDeliveryAt),
    deliveredAt: toIsoString(delivery.deliveredAt),
  };
}

function buildOrderWhere(
  filters: Pick<
    OrderListOptions,
    "customerId" | "status" | "query" | "createdFrom" | "createdTo"
  >,
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.status) where.status = filters.status;
  if (filters.query)
    where.orderNumber = {
      contains: filters.query.trim(),
    };

  if (filters.createdFrom || filters.createdTo) {
    const createdAt: Prisma.DateTimeFilter<"Order"> = {};

    if (filters.createdFrom) createdAt.gte = filters.createdFrom;
    if (filters.createdTo) createdAt.lte = filters.createdTo;

    where.createdAt = createdAt;
  }

  return where;
}

/**
 * Service métier Order en lecture seule.
 */
export class OrderService {
  constructor(private readonly prisma: LogisticsPrismaClient) {}

  // Recherches unitaires

  async findById(orderId: string): Promise<OrderResultDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    return this.toResult(order);
  }

  async findByOrderNumber(
    orderNumber: string,
  ): Promise<OrderResultDto> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: orderNumber.trim() },
    });

    return this.toResult(order);
  }

  async findLastForCustomer(
    customerId: string,
  ): Promise<OrderResultDto> {
    const order = await this.prisma.order.findFirst({
      where: { customerId },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });

    return this.toResult(
      order,
      "Commande introuvable pour le client authentifié.",
    );
  }

  // Collections, recherche et comptage

  async list(
    rawOptions: OrderListOptions = {},
  ): Promise<OrderListResultDto> {
    const limit = rawOptions.limit ?? 25;
    const query: Prisma.OrderFindManyArgs = {
      where: buildOrderWhere(rawOptions),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    };

    if (rawOptions.cursor) {
      query.cursor = { id: rawOptions.cursor };
      query.skip = 1;
    }

    const orders = await this.prisma.order.findMany(query);
    const hasNextPage = orders.length > limit;
    const page = hasNextPage
      ? orders.slice(0, limit)
      : orders;

    return orderListResultSchema.parse({
      orders: page.map(mapOrder),
      nextCursor: hasNextPage ? page.at(-1)?.id ?? null : null,
    });
  }

  listByCustomer(
    customerId: string,
    options: Omit<OrderListOptions, "customerId"> = {},
  ): Promise<OrderListResultDto> {
    return this.list({
      customerId,
      status: options.status,
      query: options.query,
      createdFrom: options.createdFrom,
      createdTo: options.createdTo,
      cursor: options.cursor,
      limit: options.limit,
    });
  }

  search(
    query: string,
    options: Omit<OrderListOptions, "query"> = {},
  ): Promise<OrderListResultDto> {
    return this.list({
      customerId: options.customerId,
      status: options.status,
      query,
      createdFrom: options.createdFrom,
      createdTo: options.createdTo,
      cursor: options.cursor,
      limit: options.limit,
    });
  }

  count(
    rawFilters: Omit<
      OrderListOptions,
      "cursor" | "limit"
    > = {},
  ) {
    return this.prisma.order.count({
      where: buildOrderWhere(rawFilters),
    });
  }

  // Lectures détaillées pour le client authentifié

  async getStatus(
    customerId: string,
    orderNumber: string,
  ): Promise<OrderStatusResultDto> {
    const order = await this.prisma.order.findFirst({
      where: {
        customerId,
        orderNumber: orderNumber.trim(),
      },
      select: {
        orderNumber: true,
        status: true,
        orderedAt: true,
        requestedDeliveryDate: true,
        totalIncludingTax: true,
        currencyCode: true,
        deliveries: {
          select: {
            deliveryNumber: true,
            status: true,
            carrierName: true,
            trackingNumber: true,
            trackingUrl: true,
            plannedShipmentAt: true,
            shippedAt: true,
            estimatedDeliveryAt: true,
            deliveredAt: true,
          },
          orderBy: { createdAt: "asc" },
          take: 50,
        },
      },
    });

    if (!order)
      return notFound("Commande introuvable pour le client authentifié.");

    return orderStatusResultSchema.parse({
      found: true,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        orderedAt: toIsoString(order.orderedAt),
        requestedDeliveryDate: toIsoString(
          order.requestedDeliveryDate,
        ),
        totalIncludingTax: decimalToString(order.totalIncludingTax),
        currencyCode: order.currencyCode,
        deliveries: order.deliveries.map(mapDelivery),
      },
    });
  }

  async getDetails(
    customerId: string,
    orderNumber: string,
  ): Promise<OrderDetailsResultDto> {
    const order = await this.prisma.order.findFirst({
      where: {
        customerId,
        orderNumber: orderNumber.trim(),
      },
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
          select: {
            deliveryNumber: true,
            status: true,
            carrierName: true,
            trackingNumber: true,
            trackingUrl: true,
            plannedShipmentAt: true,
            shippedAt: true,
            estimatedDeliveryAt: true,
            deliveredAt: true,
          },
          orderBy: { createdAt: "asc" },
          take: 50,
        },
      },
    });

    if (!order)
      return notFound("Commande introuvable pour le client authentifié.");

    return orderDetailsResultSchema.parse({
      found: true,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        orderedAt: toIsoString(order.orderedAt),
        requestedDeliveryDate: toIsoString(
          order.requestedDeliveryDate,
        ),
        currencyCode: order.currencyCode,
        amounts: {
          subtotal: decimalToString(order.subtotalAmount),
          discount: decimalToString(order.discountAmount),
          shipping: decimalToString(order.shippingAmount),
          tax: decimalToString(order.taxAmount),
          totalExcludingTax: decimalToString(
            order.totalExcludingTax,
          ),
          totalIncludingTax: decimalToString(
            order.totalIncludingTax,
          ),
          paid: decimalToString(order.paidAmount),
          refunded: decimalToString(order.refundedAmount),
          due: decimalToString(order.amountDue),
        },
        lines: order.lines.map((line) => {
          const shippedQuantity = line.deliveryLines.reduce(
            (total, deliveryLine) =>
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
            discountAmount: decimalToString(
              line.price.discountAmount,
            ),
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

  private toResult(
    order: Order | null,
    notFoundMessage = "Commande introuvable.",
  ): OrderResultDto {
    if (!order) return notFound(notFoundMessage);

    return orderResultSchema.parse({
      found: true,
      order: mapOrder(order),
    });
  }

  async getOrderSummary(customerId: string): Promise<OrderSummaryResultDto> {
    const orders = await this.prisma.order.findMany({
      where: { customerId }
    });

    let totalSpent = 0;
    let totalDue = 0;
    const byStatus: Record<string, number> = {};

    for (const order of orders) {
      if (order.status === 'DELIVERED' || order.status === 'SHIPPED' || order.status === 'CONFIRMED' || order.status === 'PARTIALLY_SHIPPED' || order.status === 'PROCESSING') {
        totalSpent += Number(order.totalIncludingTax);
      }
      totalDue += Number(order.amountDue);
      
      byStatus[order.status] = (byStatus[order.status] || 0) + 1;
    }

    const avg = orders.length ? (totalSpent / orders.length).toFixed(2) : "0.00";

    return orderSummaryResultSchema.parse({
      totalOrders: orders.length,
      ordersByStatus: byStatus,
      totalSpent: totalSpent.toFixed(2),
      totalDue: totalDue.toFixed(2),
      averageCart: avg
    });
  }

  async getProductOrderHistory(customerId: string, sku: string): Promise<ProductOrderHistoryResultDto> {
    const lines = await this.prisma.orderLine.findMany({
      where: {
        order: { customerId },
        skuSnapshot: sku
      },
      include: { order: true },
      orderBy: { createdAt: 'desc' }
    });

    return productOrderHistoryResultSchema.parse({
      found: lines.length > 0,
      orders: lines.map(line => ({
        orderNumber: line.order.orderNumber,
        orderedAt: line.order.orderedAt ? line.order.orderedAt.toISOString() : null,
        status: line.order.status,
        orderedQuantity: line.orderedQuantity
      }))
    });
  }

  async getUpcomingDeliveries(customerId: string, daysAhead = 14): Promise<UpcomingDeliveriesResultDto> {
    const minDate = new Date();
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + daysAhead);

    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        requestedDeliveryDate: {
          gte: minDate,
          lte: maxDate
        },
        status: { notIn: ['DELIVERED', 'CANCELLED'] }
      }
    });

    return upcomingDeliveriesResultSchema.parse({
      deliveries: orders.map(order => ({
        orderNumber: order.orderNumber,
        requestedDeliveryDate: order.requestedDeliveryDate ? order.requestedDeliveryDate.toISOString() : null,
        status: order.status
      }))
    });
  }
}
