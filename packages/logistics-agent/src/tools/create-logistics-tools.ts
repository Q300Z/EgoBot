import type { LogisticsPrismaClient } from "../database/index.js";
import {
  authenticatedCustomerSchema,
  type AuthenticatedCustomer,
} from "../dtos/index.js";
import {
  DeliveryQueryService,
  InventoryQueryService,
  OrderQueryService,
} from "../services/index.js";
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
  const orderQueryService = new OrderQueryService(prisma);
  const deliveryQueryService = new DeliveryQueryService(prisma);
  const inventoryQueryService = new InventoryQueryService(prisma);

  return [
    ...createOrderTools(customer, orderQueryService),
    ...createDeliveryTools(customer, deliveryQueryService),
    ...createInventoryTools(inventoryQueryService),
  ];
}
