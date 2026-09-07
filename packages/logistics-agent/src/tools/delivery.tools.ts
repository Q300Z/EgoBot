import { tool } from "langchain";
import type { AuthenticatedCustomer } from "../dtos/index.js";
import type { DeliveryQueryService } from "../services/index.js";
import { deliveryTrackingInputSchema } from "./schemas.js";

export function createDeliveryTools(
  customer: AuthenticatedCustomer,
  deliveryQueryService: DeliveryQueryService,
) {
  const getDeliveryTracking = tool(
    ({ deliveryNumber, trackingNumber }) =>
      deliveryQueryService.getTracking(customer.customerId, {
        deliveryNumber,
        trackingNumber,
      }),
    {
      name: "get_delivery_tracking",
      description:
        "Consulte le statut, le transporteur, les dates et le contenu d'une livraison appartenant au client authentifié.",
      schema: deliveryTrackingInputSchema,
    },
  );

  return [getDeliveryTracking] as const;
}
