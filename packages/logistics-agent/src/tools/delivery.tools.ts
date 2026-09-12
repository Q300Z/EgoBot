import { tool } from "langchain";
import type { AuthenticatedCustomer } from "../dtos/index.js";
import type { DeliveryQueryService } from "../services/index.js";
import { deliveryTrackingInputSchema, 
  orderDeliveriesInputSchema,
  deliveryStatsInputSchema,
 } from "./schemas.js";

/**
 * Crée les 3 outils LangChain spécialisés dans le suivi d'acheminement et les statistiques de livraison.
 *
 * Le suivi est scopé au client authentifié pour empêcher toute consultation de colis tiers.
 *
 * @param customer - Informations du client authentifié.
 * @param deliveryQueryService - Service de consultation des livraisons.
 * @returns Tuple contenant `get_delivery_tracking`, `list_deliveries_for_order` et `get_delivery_stats`.
 */
export function createDeliveryTools(
  customer: AuthenticatedCustomer,
  deliveryQueryService: DeliveryQueryService,
) {
  const getDeliveryTracking = tool(
    ({ deliveryNumber, trackingNumber, orderNumber }) =>
      deliveryQueryService.getTracking(customer.customerId, {
        deliveryNumber,
        trackingNumber,
        orderNumber,
      }),
    {
      name: "get_delivery_tracking",
      description:
        "Consulte le statut, le transporteur, les dates et le contenu d'une livraison appartenant au client authentifié. Recherche par numéro de livraison, numéro de suivi transporteur ou numéro de commande.",
      schema: deliveryTrackingInputSchema,
    },
  );

  
  const listDeliveriesForOrder = tool(
    ({ orderNumber }) => deliveryQueryService.listDeliveriesForOrder(customer.customerId, orderNumber),
    {
      name: "list_deliveries_for_order",
      description: "Retourne toutes les livraisons rattachées à une commande du client.",
      schema: orderDeliveriesInputSchema,
    }
  );

  const getDeliveryStats = tool(
    () => deliveryQueryService.getDeliveryStats(customer.customerId),
    {
      name: "get_delivery_stats",
      description: "Retourne les statistiques globales de livraison pour le client.",
      schema: deliveryStatsInputSchema,
    }
  );

  return [getDeliveryTracking, listDeliveriesForOrder, getDeliveryStats] as const;
}
