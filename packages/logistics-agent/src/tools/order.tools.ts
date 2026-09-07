import { tool } from "langchain";
import { z } from "zod";
import type { AuthenticatedCustomer } from "../dtos/index.js";
import type { OrderService } from "../services/index.js";
import { orderNumberInputSchema } from "./schemas.js";

const emptyOrderInputSchema = z.object({});

export function createOrderTools(
  customer: AuthenticatedCustomer,
  orderService: OrderService,
) {
  const getOrderStatus = tool(
    ({ orderNumber }) =>
      orderService.getStatus(customer.customerId, orderNumber),
    {
      name: "get_order_status",
      description:
        "Consulte le statut, les dates, le montant total et les livraisons d'une commande appartenant au client authentifié.",
      schema: orderNumberInputSchema,
    },
  );

  const getOrderDetails = tool(
    ({ orderNumber }) =>
      orderService.getDetails(customer.customerId, orderNumber),
    {
      name: "get_order_details",
      description:
        "Récupère les montants, les articles, les quantités expédiées et les livraisons d'une commande appartenant au client authentifié.",
      schema: orderNumberInputSchema,
    },
  );

  const getLastOrder = tool(
    () => orderService.findLastForCustomer(customer.customerId),
    {
      name: "get_last_order",
      description:
        "Récupère la dernière commande créée par le client authentifié.",
      schema: emptyOrderInputSchema,
    },
  );

  return [getOrderStatus, getOrderDetails, getLastOrder] as const;
}
