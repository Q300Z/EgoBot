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

export interface CreateLogisticsToolsOptions {
  customer: AuthenticatedCustomer;
  prisma: LogisticsPrismaClient;
}

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
    get_customer_profile: { maxCalls: 1 },
    get_customer_identity: { maxCalls: 1 },
    get_customer_current_address: { maxCalls: 1 },
    get_last_order: { maxCalls: 2 },
    get_order_status: { maxCalls: 5 },
    get_order_details: { maxCalls: 5 },
    list_customer_orders: { maxCalls: 3 },
    search_orders: { maxCalls: 3 },
    get_delivery_tracking: { maxCalls: 5 },
    get_product_availability: { maxCalls: 5 },
    
    get_stock_by_location: { maxCalls: 5 },
    get_movement_history: { maxCalls: 5 },
    get_stock_alerts: { maxCalls: 3 },
    get_estimated_restock: { maxCalls: 5 },
    get_order_summary: { maxCalls: 2 },
    get_product_order_history: { maxCalls: 5 },
    get_upcoming_deliveries: { maxCalls: 3 },
    list_deliveries_for_order: { maxCalls: 5 },
    get_delivery_stats: { maxCalls: 2 },

  });
}
