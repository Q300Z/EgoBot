import type { LogisticsPrismaClient } from "../database/index.js";

import {
  orderDeliveriesResultSchema,
  deliveryStatsResultSchema,
  type OrderDeliveriesResultDto,
  type DeliveryStatsResultDto,
} from "../dtos/index.js";

import {
  deliveryTrackingResultSchema,
  notFound,
  type DeliveryTrackingResultDto,
} from "../dtos/index.js";
import { toIsoString } from "./serialization.js";

export interface DeliveryLookup {
  deliveryNumber?: string;
  trackingNumber?: string;
  orderNumber?: string;
}

export class DeliveryQueryService {
  constructor(private readonly prisma: LogisticsPrismaClient) {}

  async listDeliveriesForOrder(customerId: string, orderNumber: string): Promise<OrderDeliveriesResultDto> {
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        order: {
          customerId,
          orderNumber
        }
      },
      include: {
        order: true,
        lines: {
          include: {
            orderLine: true
          }
        }
      }
    });

    if (!deliveries.length) {
      return { found: false, error: "Aucune livraison trouvée pour cette commande." } as any;
    }

    return orderDeliveriesResultSchema.parse({
      found: true,
      deliveries: deliveries.map(d => ({
        deliveryNumber: d.deliveryNumber,
        status: d.status,
        carrierName: d.carrierName,
        trackingNumber: d.trackingNumber,
        trackingUrl: d.trackingUrl,
        plannedShipmentAt: toIsoString(d.plannedShipmentAt),
        shippedAt: toIsoString(d.shippedAt),
        estimatedDeliveryAt: toIsoString(d.estimatedDeliveryAt),
        deliveredAt: toIsoString(d.deliveredAt),
        orderNumber: d.order.orderNumber,
        contents: d.lines.map(line => ({
          sku: line.orderLine.skuSnapshot,
          name: line.orderLine.nameSnapshot,
          orderedQuantity: line.orderLine.orderedQuantity,
          shippedQuantity: line.shippedQuantity
        }))
      }))
    });
  }

  async getDeliveryStats(customerId: string): Promise<DeliveryStatsResultDto> {
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        order: { customerId }
      }
    });

    const byStatus: Record<string, number> = {};
    const carriers = new Set<string>();

    for (const d of deliveries) {
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
      if (d.carrierName) carriers.add(d.carrierName);
    }

    return deliveryStatsResultSchema.parse({
      totalDeliveries: deliveries.length,
      deliveriesByStatus: byStatus,
      carriers: Array.from(carriers)
    });
  }

  async getTracking(
    customerId: string,
    lookup: DeliveryLookup,
  ): Promise<DeliveryTrackingResultDto> {
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        ...(lookup.deliveryNumber
          ? { deliveryNumber: lookup.deliveryNumber }
          : {}),
        ...(lookup.trackingNumber
          ? { trackingNumber: lookup.trackingNumber }
          : {}),
        order: {
          customerId,
          ...(lookup.orderNumber ? { orderNumber: lookup.orderNumber } : {}),
        },
      },
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
        order: { select: { orderNumber: true } },
        lines: {
          select: {
            shippedQuantity: true,
            orderLine: {
              select: {
                skuSnapshot: true,
                nameSnapshot: true,
                orderedQuantity: true,
              },
            },
          },
          take: 100,
        },
      },
    });

    if (!delivery) {
      return notFound("Livraison introuvable pour le client authentifié.");
    }

    return deliveryTrackingResultSchema.parse({
      found: true,
      delivery: {
        deliveryNumber: delivery.deliveryNumber,
        status: delivery.status,
        carrierName: delivery.carrierName,
        trackingNumber: delivery.trackingNumber,
        trackingUrl: delivery.trackingUrl,
        plannedShipmentAt: toIsoString(delivery.plannedShipmentAt),
        shippedAt: toIsoString(delivery.shippedAt),
        estimatedDeliveryAt: toIsoString(
          delivery.estimatedDeliveryAt,
        ),
        deliveredAt: toIsoString(delivery.deliveredAt),
        orderNumber: delivery.order.orderNumber,
        contents: delivery.lines.map((line: {
          shippedQuantity: number;
          orderLine: {
            skuSnapshot: string;
            nameSnapshot: string;
            orderedQuantity: number;
          };
        }) => ({
          sku: line.orderLine.skuSnapshot,
          name: line.orderLine.nameSnapshot,
          orderedQuantity: line.orderLine.orderedQuantity,
          shippedQuantity: line.shippedQuantity,
        })),
      },
    });
  }
}
