import type { LogisticsPrismaClient } from "../database/index.js";
import {
  deliveryTrackingResultSchema,
  notFound,
  type DeliveryTrackingResultDto,
} from "../dtos/index.js";
import { toIsoString } from "./serialization.js";

export interface DeliveryLookup {
  deliveryNumber?: string;
  trackingNumber?: string;
}

export class DeliveryQueryService {
  constructor(private readonly prisma: LogisticsPrismaClient) {}

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
        order: { customerId },
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
