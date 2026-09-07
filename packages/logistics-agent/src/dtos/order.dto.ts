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

export const orderAmountsSchema = z.object({
  subtotal: moneySchema,
  discount: moneySchema,
  shipping: moneySchema,
  tax: moneySchema,
  totalExcludingTax: moneySchema,
  totalIncludingTax: moneySchema,
  paid: moneySchema,
  refunded: moneySchema,
  due: moneySchema,
});

/**
 * Représentation scalaire complète de l'entité Prisma Order.
 *
 * Les lignes et livraisons ont leurs propres contrats et ne sont pas
 * mélangées aux mutations directes de la commande.
 */
export const orderSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string(),
  customerId: z.uuid(),
  billingAddressId: z.uuid(),
  shippingAddressId: z.uuid(),
  status: orderStatusSchema,
  orderedAt: nullableDateTimeSchema,
  requestedDeliveryDate: nullableDateTimeSchema,
  currencyCode: z.string().length(3),
  amounts: orderAmountsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const orderResultSchema = z.union([
  z.object({
    found: z.literal(true),
    order: orderSchema,
  }),
  notFoundResultSchema,
]);

export const orderListResultSchema = z.object({
  orders: z.array(orderSchema).max(100),
  nextCursor: z.uuid().nullable(),
});

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
  amounts: orderAmountsSchema,
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

export const orderListOptionsSchema = z.object({
  customerId: z.uuid().optional(),
  status: orderStatusSchema.optional(),
  query: z.string().trim().min(1).max(128).optional(),
  createdFrom: z.iso.datetime({ offset: true }).optional(),
  createdTo: z.iso.datetime({ offset: true }).optional(),
  cursor: z.uuid().optional(),
  limit: z.int().min(1).max(100).default(25),
});

export type OrderDto = z.infer<typeof orderSchema>;
export type OrderResultDto = z.infer<typeof orderResultSchema>;
export type OrderListResultDto = z.infer<
  typeof orderListResultSchema
>;
export type OrderStatusResultDto = z.infer<typeof orderStatusResultSchema>;
export type OrderDetailsResultDto = z.infer<typeof orderDetailsResultSchema>;
export type OrderListOptions = z.input<typeof orderListOptionsSchema>;
