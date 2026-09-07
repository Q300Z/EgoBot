import { tool } from "langchain";
import type { InventoryQueryService } from "../services/index.js";
import { productAvailabilityInputSchema } from "./schemas.js";

export function createInventoryTools(
  inventoryQueryService: InventoryQueryService,
) {
  const getProductAvailability = tool(
    ({ sku }) =>
      inventoryQueryService.getProductAvailability(sku),
    {
      name: "get_product_availability",
      description:
        "Indique si un article actif est disponible et retourne ses quantités globales en stock, réservées et disponibles.",
      schema: productAvailabilityInputSchema,
    },
  );

  return [getProductAvailability] as const;
}
