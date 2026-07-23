import { z } from "zod";

export const orderNumberInputSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe("Numéro métier de la commande, par exemple CMD-2026-0042."),
});

export const deliveryTrackingInputSchema = z
  .object({
    deliveryNumber: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe("Numéro métier de la livraison."),
    trackingNumber: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .optional()
      .describe("Numéro de suivi fourni par le transporteur."),
  })
  .refine(
    ({ deliveryNumber, trackingNumber }) =>
      Boolean(deliveryNumber || trackingNumber),
    {
      message:
        "Un numéro de livraison ou un numéro de suivi est requis.",
    },
  );

export const productAvailabilityInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe("Référence SKU exacte de l'article."),
});
