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

  return [
    customerTools,
    orderTools,
    deliveryTools,
    inventoryTools,
  ].flat();
}
