import { z } from "zod";
import {
  moneySchema,
  notFoundResultSchema,
  nullableDateTimeSchema,
} from "./common.dto.js";
import { deliverySummarySchema } from "./delivery.dto.js";

export const orderStatusSchema = z.enum([
  "DRAFT",
  "CONFIRMED",
  "PROCESSING",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);

export const orderStatusDetailsSchema = z.object({
  orderNumber: z.string(),
  status: orderStatusSchema,
  orderedAt: nullableDateTimeSchema,
  requestedDeliveryDate: nullableDateTimeSchema,
  totalIncludingTax: moneySchema,
  currencyCode: z.string().length(3),
  deliveries: z.array(deliverySummarySchema).max(50),
});

export const orderStatusResultSchema = z.union([
  z.object({
    found: z.literal(true),
    order: orderStatusDetailsSchema,
  }),
  notFoundResultSchema,
]);

export const orderLineDetailsSchema = z.object({
  lineNumber: z.int().positive(),
  sku: z.string(),
  name: z.string(),
  orderedQuantity: z.int().nonnegative(),
  shippedQuantity: z.int().nonnegative(),
  remainingQuantity: z.int().nonnegative(),
  currencyCode: z.string().length(3),
  unitPriceExcludingTax: moneySchema,
  discountAmount: moneySchema,
  taxRate: moneySchema,
  lineTotalExcludingTax: moneySchema,
  lineTotalIncludingTax: moneySchema,
});

export const orderDetailsSchema = z.object({
  orderNumber: z.string(),
  status: orderStatusSchema,
  orderedAt: nullableDateTimeSchema,
  requestedDeliveryDate: nullableDateTimeSchema,
  currencyCode: z.string().length(3),
  amounts: z.object({
    subtotal: moneySchema,
    discount: moneySchema,
    shipping: moneySchema,
    tax: moneySchema,
    totalExcludingTax: moneySchema,
    totalIncludingTax: moneySchema,
    paid: moneySchema,
    refunded: moneySchema,
    due: moneySchema,
  }),
  lines: z.array(orderLineDetailsSchema).max(100),
  deliveries: z.array(deliverySummarySchema).max(50),
});

export const orderDetailsResultSchema = z.union([
  z.object({
    found: z.literal(true),
    order: orderDetailsSchema,
  }),
  notFoundResultSchema,
]);

export type OrderStatusResultDto = z.infer<typeof orderStatusResultSchema>;
export type OrderDetailsResultDto = z.infer<typeof orderDetailsResultSchema>;
