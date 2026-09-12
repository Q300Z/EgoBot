import { z } from "zod";

export const orderNumberInputSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe("Numéro métier de la commande au format CMD-YYYY-NNNNNN (ex: CMD-2026-000042). Si inconnu, utiliser get_last_order."),
});

export const deliveryTrackingInputSchema = z
  .object({
    deliveryNumber: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe("Numéro de livraison au format LIV-YYYY-NNNNNN (ex: LIV-2026-000003)."),
    trackingNumber: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .optional()
      .describe("Numéro de suivi alphanumérique du transporteur (ex: 6A12345678901)."),
    orderNumber: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe("Numéro de commande associée au format CMD-YYYY-NNNNNN. Permet de retrouver la livraison sans connaître le numéro de livraison."),
  })
  .refine(
    ({ deliveryNumber, trackingNumber, orderNumber }) =>
      Boolean(deliveryNumber || trackingNumber || orderNumber),
    {
      message:
        "Un numéro de livraison, de suivi ou de commande est requis.",
    },
  );

export const productAvailabilityInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe("Référence SKU exacte au format SKU-NNNNN (ex: SKU-00042). Utiliser le SKU retourné par get_order_details si disponible."),
});

export const orderListInputSchema = z.object({
  status: z.string().trim().min(1).max(32).optional()
    .describe("Filtre par statut : DRAFT, CONFIRMED, PROCESSING, PARTIALLY_SHIPPED, SHIPPED, DELIVERED, CANCELLED. Omettre pour tous les statuts."),
  limit: z.number().int().min(1).max(25).default(10)
    .describe("Nombre max de commandes à retourner (1-25, défaut: 10)."),
});

export const orderSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(128)
    .describe("Texte libre à rechercher dans les numéros de commande (ex: CMD-2026-0004)."),
  status: z.string().trim().min(1).max(32).optional()
    .describe("Filtre optionnel par statut de commande."),
  limit: z.number().int().min(1).max(25).default(10)
    .describe("Nombre max de résultats (1-25, défaut: 10)."),
});

export const stockByLocationInputSchema = z.object({
  sku: z.string().trim().min(1).max(64)
    .describe("Référence SKU exacte au format SKU-NNNNN (ex: SKU-00042)."),
});

export const movementHistoryInputSchema = z.object({
  sku: z.string().trim().min(1).max(64).describe("Référence SKU du produit"),
  limitDays: z.number().int().optional().describe("Nombre de jours à remonter (défaut 30)"),
});

export const stockAlertsInputSchema = z.object({}); // No input needed

export const estimatedRestockInputSchema = z.object({
  sku: z.string().trim().min(1).max(64).describe("Référence SKU du produit"),
});

export const orderSummaryInputSchema = z.object({}); // No input needed, uses customerId from context

export const productOrderHistoryInputSchema = z.object({
  sku: z.string().trim().min(1).max(64).describe("Référence SKU du produit"),
});

export const upcomingDeliveriesInputSchema = z.object({
  daysAhead: z.number().int().optional().describe("Nombre de jours à regarder (défaut 14)"),
});

export const orderDeliveriesInputSchema = z.object({
  orderNumber: z.string().trim().min(1).max(64).describe("Numéro de commande"),
});

export const deliveryStatsInputSchema = z.object({}); // No input needed
