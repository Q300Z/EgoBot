import { tool } from "langchain";
import type { AuthenticatedCustomer } from "../dtos/index.js";
import type { DeliveryQueryService } from "../services/index.js";
import { deliveryTrackingInputSchema, 
  orderDeliveriesInputSchema,
  deliveryStatsInputSchema,
 } from "./schemas.js";

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
