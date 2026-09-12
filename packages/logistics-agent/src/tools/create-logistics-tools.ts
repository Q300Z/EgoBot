import type { LogisticsPrismaClient } from "../database/index.js";
import {
  authenticatedCustomerSchema,
  type AuthenticatedCustomer,
} from "../dtos/index.js";
import {
  CustomerService,
  DeliveryQueryService,
  InventoryQueryService,
  OrderService,
} from "../services/index.js";
import { createCustomerTools } from "./customer.tools.js";
import { createDeliveryTools } from "./delivery.tools.js";
import { createInventoryTools } from "./inventory.tools.js";
import { createOrderTools } from "./order.tools.js";
import { wrapTools } from "./tool-wrapper.js";

/**
 * Options nécessaires pour instancier la suite complète d'outils logistiques.
 */
export interface CreateLogisticsToolsOptions {
  /**
   * Profil du client authentifié (customerId, email).
   * Utilisé pour verrouiller et scoper toutes les requêtes de commande/livraison
   * au seul périmètre de ce client, sans jamais exposer son identifiant au LLM.
   */
  customer: AuthenticatedCustomer;
  /**
   * Instance du client Prisma connecté à la base de données logistique SQLite.
   */
  prisma: LogisticsPrismaClient;
}

/**
 * Instancie et configure les 19 outils logistiques du package :
 * - Outils Client (`get_customer_profile`, `get_customer_identity`, `get_customer_current_address`)
 * - Outils Commande (`get_order_status`, `get_order_details`, `get_last_order`, `list_customer_orders`, `search_orders`, `get_order_summary`, `get_product_order_history`, `get_upcoming_deliveries`)
 * - Outils Livraison (`get_delivery_tracking`, `list_deliveries_for_order`, `get_delivery_stats`)
 * - Outils Inventaire / Stock (`get_product_availability`, `get_stock_by_location`, `get_movement_history`, `get_stock_alerts`, `get_estimated_restock`)
 *
 * Tous les outils sont automatiquement encapsulés par `wrapTools` avec des quotas d'appels (`maxCalls`)
 * adaptés à chaque usage pour prévenir les boucles ou les abus.
 *
 * @param options - Le client connecté et l'instance Prisma.
 * @returns La liste complète des outils LangChain prêts à être fournis au ReactAgent.
 */
export function createLogisticsTools({
  customer: rawCustomer,
  prisma,
}: CreateLogisticsToolsOptions) {
  const customer = authenticatedCustomerSchema.parse(rawCustomer);
  const customerService = new CustomerService(prisma);
  const orderService = new OrderService(prisma);
  const deliveryQueryService = new DeliveryQueryService(prisma);
  const inventoryQueryService = new InventoryQueryService(prisma);

  const customerTools = createCustomerTools(customer, customerService);
  const orderTools = createOrderTools(customer, orderService);
  const deliveryTools = createDeliveryTools(
    customer,
    deliveryQueryService,
  );
  const inventoryTools = createInventoryTools(inventoryQueryService);

  const allTools = [
    customerTools,
    orderTools,
    deliveryTools,
    inventoryTools,
  ].flat();

  return wrapTools(allTools, {
    get_customer_profile: { maxCalls: 2 },
    get_customer_identity: { maxCalls: 2 },
    get_customer_current_address: { maxCalls: 2 },
    get_last_order: { maxCalls: 3 },
    get_order_status: { maxCalls: 15 },
    get_order_details: { maxCalls: 15 },
    list_customer_orders: { maxCalls: 5 },
    search_orders: { maxCalls: 5 },
    get_delivery_tracking: { maxCalls: 10 },
    get_product_availability: { maxCalls: 10 },
    get_stock_by_location: { maxCalls: 10 },
    get_movement_history: { maxCalls: 10 },
    get_stock_alerts: { maxCalls: 5 },
    get_estimated_restock: { maxCalls: 10 },
    get_order_summary: { maxCalls: 3 },
    get_product_order_history: { maxCalls: 10 },
    get_upcoming_deliveries: { maxCalls: 5 },
    list_deliveries_for_order: { maxCalls: 10 },
    get_delivery_stats: { maxCalls: 3 },
  });
}
