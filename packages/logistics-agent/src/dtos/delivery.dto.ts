import { z } from "zod";
import {
  notFoundResultSchema,
  nullableDateTimeSchema,
} from "./common.dto.js";

export const deliveryStatusSchema = z.enum([
  "PLANNED",
  "PREPARING",
  "READY",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED",
  "RETURNED",
  "CANCELLED",
]);

export const deliverySummarySchema = z.object({
  deliveryNumber: z.string(),
  status: deliveryStatusSchema,
  carrierName: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  plannedShipmentAt: nullableDateTimeSchema,
  shippedAt: nullableDateTimeSchema,
  estimatedDeliveryAt: nullableDateTimeSchema,
  deliveredAt: nullableDateTimeSchema,
});

export const deliveryLineSchema = z.object({
  sku: z.string(),
  name: z.string(),
  orderedQuantity: z.int().nonnegative(),
  shippedQuantity: z.int().nonnegative(),
});

export const deliveryTrackingSchema = deliverySummarySchema.extend({
  orderNumber: z.string(),
  contents: z.array(deliveryLineSchema).max(100),
});

export const deliveryTrackingResultSchema = z.union([
  z.object({
    found: z.literal(true),
    delivery: deliveryTrackingSchema,
  }),
  notFoundResultSchema,
]);

export type DeliverySummaryDto = z.infer<typeof deliverySummarySchema>;
export type DeliveryTrackingResultDto = z.infer<
  typeof deliveryTrackingResultSchema
>;
