import { z } from "zod";
import { notFoundResultSchema } from "./common.dto.js";

export const productAvailabilitySchema = z.object({
  sku: z.string(),
  name: z.string(),
  isAvailable: z.boolean(),
  onHandQuantity: z.int(),
  reservedQuantity: z.int(),
  availableQuantity: z.int(),
  safetyStockQuantity: z.int(),
});

export const productAvailabilityResultSchema = z.union([
  z.object({
    found: z.literal(true),
    product: productAvailabilitySchema,
  }),
  notFoundResultSchema,
]);

export type ProductAvailabilityResultDto = z.infer<
  typeof productAvailabilityResultSchema
>;

export const stockLocationSchema = z.object({
  locationCode: z.string(),
  onHandQuantity: z.int(),
  reservedQuantity: z.int(),
  availableQuantity: z.int(),
  safetyStockQuantity: z.int(),
});

export const stockByLocationSchema = z.object({
  sku: z.string(),
  name: z.string(),
  locations: z.array(stockLocationSchema),
});

export const stockByLocationResultSchema = z.union([
  z.object({
    found: z.literal(true),
    product: stockByLocationSchema,
  }),
  notFoundResultSchema,
]);

export type StockByLocationResultDto = z.infer<typeof stockByLocationResultSchema>;

export const stockMovementSchema = z.object({
  id: z.string(),
  locationCode: z.string(),
  type: z.string(),
  quantity: z.number().int(),
  occurredAt: z.string(),
  referenceId: z.string().nullable(),
});

export const movementHistoryResultSchema = z.union([
  z.object({
    found: z.literal(true),
    sku: z.string(),
    name: z.string(),
    movements: z.array(stockMovementSchema),
  }),
  notFoundResultSchema,
]);

export type MovementHistoryResultDto = z.infer<typeof movementHistoryResultSchema>;

export const stockAlertSchema = z.object({
  sku: z.string(),
  name: z.string(),
  locationCode: z.string(),
  availableQuantity: z.number().int(),
  safetyStockQuantity: z.number().int(),
});

export const stockAlertsResultSchema = z.object({
  found: z.literal(true),
  alerts: z.array(stockAlertSchema),
});

export type StockAlertsResultDto = z.infer<typeof stockAlertsResultSchema>;

export const estimatedRestockResultSchema = z.union([
  z.object({
    found: z.literal(true),
    leadTimeDays: z.number().int(),
    estimatedDate: z.string(),
  }),
  notFoundResultSchema,
]);

export type EstimatedRestockResultDto = z.infer<typeof estimatedRestockResultSchema>;
