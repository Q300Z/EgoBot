import { tool } from "langchain";
import type { InventoryQueryService } from "../services/index.js";
import { productAvailabilityInputSchema, stockByLocationInputSchema,
  movementHistoryInputSchema,
  stockAlertsInputSchema,
  estimatedRestockInputSchema
} from "./schemas.js";

/**
 * Crée les 5 outils LangChain dédiés à l'inventaire, aux stocks et aux approvisionnements.
 *
 * Contrairement aux outils client ou commande, ces outils sont globaux (catalogue et entrepôts)
 * et ne dépendent pas d'un identifiant client spécifique.
 *
 * @param inventoryQueryService - Service de consultation des stocks et mouvements.
 * @returns Tuple contenant `getProductAvailability`, `getStockByLocation`, `getMovementHistory`, `getStockAlerts` et `getEstimatedRestock`.
 */
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

  const getStockByLocation = tool(
    ({ sku }) => inventoryQueryService.getStockByLocation(sku),
    {
      name: "get_stock_by_location",
      description:
        "Retourne le détail du stock d'un article par entrepôt (emplacement), avec les quantités en stock, réservées, disponibles et le seuil de sécurité pour chaque site.",
      schema: stockByLocationInputSchema,
    },
  );

  
  const getMovementHistory = tool(
    ({ sku, limitDays }) => inventoryQueryService.getMovementHistory(sku, limitDays),
    {
      name: "get_movement_history",
      description: "Retourne l'historique des mouvements de stock d'un produit.",
      schema: movementHistoryInputSchema,
    },
  );

  const getStockAlerts = tool(
    () => inventoryQueryService.getStockAlerts(),
    {
      name: "get_stock_alerts",
      description: "Retourne les alertes de stock (disponible <= 0 ou sous seuil de sécurité).",
      schema: stockAlertsInputSchema,
    },
  );

  const getEstimatedRestock = tool(
    ({ sku }) => inventoryQueryService.getEstimatedRestock(sku),
    {
      name: "get_estimated_restock",
      description: "Estime la date de réapprovisionnement d'un produit selon le délai fournisseur.",
      schema: estimatedRestockInputSchema,
    },
  );

  return [getProductAvailability, getStockByLocation, getMovementHistory, getStockAlerts, getEstimatedRestock] as const;
}
