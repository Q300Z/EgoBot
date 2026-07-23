import { z } from "zod";
import { notFoundResultSchema } from "./common.dto.js";

export const productAvailabilitySchema = z.object({
  sku: z.string(),
  name: z.string(),
  isAvailable: z.boolean(),
  onHandQuantity: z.int(),
  reservedQuantity: z.int(),
  availableQuantity: z.int(),
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
