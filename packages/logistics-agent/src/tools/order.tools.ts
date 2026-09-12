import { tool } from "langchain";
import { z } from "zod";
import type { AuthenticatedCustomer } from "../dtos/index.js";
import type { OrderService } from "../services/index.js";
import {
  orderNumberInputSchema,
  orderListInputSchema,
  orderSearchInputSchema,
  orderSummaryInputSchema,
  productOrderHistoryInputSchema,
  upcomingDeliveriesInputSchema,

} from "./schemas.js";

/**
 * Crée les 8 outils LangChain dédiés à la consultation et la recherche des commandes.
 *
 * Tous les outils vérifient implicitement que les commandes consultées appartiennent
 * au client authentifié (`customer.customerId`).
 *
 * @param customer - Informations du client authentifié.
 * @param orderService - Service métier de gestion des commandes.
 * @returns Liste des outils de commande LangChain.
 */
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

  const listCustomerOrders = tool(
    ({ status, limit }) =>
      orderService.listByCustomer(customer.customerId, {
        status: status as any,
        limit,
      }),
    {
      name: "list_customer_orders",
      description:
        "Liste les commandes du client authentifié, triées de la plus récente à la plus ancienne. Peut être filtré par statut.",
      schema: orderListInputSchema,
    },
  );

  const searchOrders = tool(
    ({ query, status, limit }) =>
      orderService.search(query, {
        customerId: customer.customerId,
        status: status as any,
        limit,
      }),
    {
      name: "search_orders",
      description:
        "Recherche parmi les commandes du client authentifié par texte libre (numéro de commande, article). Retourne les commandes correspondantes.",
      schema: orderSearchInputSchema,
    },
  );

  
  const getOrderSummary = tool(
    () => orderService.getOrderSummary(customer.customerId),
    {
      name: "get_order_summary",
      description: "Retourne un résumé agrégé des commandes du client.",
      schema: orderSummaryInputSchema,
    },
  );

  const getProductOrderHistory = tool(
    ({ sku }) => orderService.getProductOrderHistory(customer.customerId, sku),
    {
      name: "get_product_order_history",
      description: "Recherche l'historique de commande pour un produit spécifique pour ce client.",
      schema: productOrderHistoryInputSchema,
    },
  );

  const getUpcomingDeliveries = tool(
    ({ daysAhead }) => orderService.getUpcomingDeliveries(customer.customerId, daysAhead),
    {
      name: "get_upcoming_deliveries",
      description: "Liste les commandes avec une date de livraison prévue dans les prochains jours (défaut 14).",
      schema: upcomingDeliveriesInputSchema,
    },
  );

  return [getOrderStatus, getOrderDetails, getLastOrder, listCustomerOrders, searchOrders, getOrderSummary, getProductOrderHistory, getUpcomingDeliveries] as const;
}
