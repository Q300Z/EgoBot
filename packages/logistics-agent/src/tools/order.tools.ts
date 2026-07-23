import { tool } from "langchain";
import type { AuthenticatedCustomer } from "../dtos/index.js";
import type { OrderQueryService } from "../services/index.js";
import { orderNumberInputSchema } from "./schemas.js";

export function createOrderTools(
  customer: AuthenticatedCustomer,
  orderQueryService: OrderQueryService,
) {
  const getOrderStatus = tool(
    ({ orderNumber }) =>
      orderQueryService.getStatus(customer.customerId, orderNumber),
    {
      name: "get_order_status",
      description:
        "Consulte le statut, les dates, le montant total et les livraisons d'une commande appartenant au client authentifié.",
      schema: orderNumberInputSchema,
    },
  );

  const getOrderDetails = tool(
    ({ orderNumber }) =>
      orderQueryService.getDetails(customer.customerId, orderNumber),
    {
      name: "get_order_details",
      description:
        "Récupère les montants, les articles, les quantités expédiées et les livraisons d'une commande appartenant au client authentifié.",
      schema: orderNumberInputSchema,
    },
  );

  return [getOrderStatus, getOrderDetails] as const;
}
