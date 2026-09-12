import type { SourceData } from "@egobot/shared-types";
import type {
  DeliveryTrackingResultDto,
  ProductAvailabilityResultDto,
  OrderStatusResultDto,
} from "@egobot/logistics-agent/dtos";

/**
 * Associe chaque outil logistique exécuté par l'agent à une puce de source conviviale
 * et contextualisée pour l'utilisateur final (sans jargon technique ni détails internes d'implémentation).
 *
 * @param toolName - Nom de l'outil LangChain exécuté (ex: `"get_delivery_tracking"`).
 * @param output - Données DTO retournées par l'outil.
 * @returns L'objet `SourceData` avec son titre et son type (`doc`, `api`, `database`, `file`, etc.), ou `null` si introuvable / non applicable.
 */
export function getToolSource(toolName: string, output: unknown): SourceData | null {
  const data = output as any;
  // Ne pas émettre de puce si la recherche a échoué (introuvable)
  if (data && typeof data === "object" && data.found === false) {
    return null;
  }

  switch (toolName) {
    // 👤 Profil & Compte client
    case "get_customer_profile":
    case "get_customer_identity":
      return {
        title: "Espace Client — Profil",
        type: "doc",
      };

    case "get_customer_current_address":
      return {
        title: "Carnet d'adresses",
        type: "doc",
      };

    // 📦 Suivi & Gestion des commandes
    case "get_order_status":
    case "get_order_details":
    case "get_last_order":
    case "list_customer_orders":
    case "search_orders":
      return {
        title: "Gestion des Commandes",
        type: "doc",
      };

    case "get_order_summary":
      return {
        title: "Synthèse des Commandes",
        type: "doc",
      };

    case "get_product_order_history":
      return {
        title: "Historique d'Achats",
        type: "doc",
      };

    case "get_upcoming_deliveries":
      return {
        title: "Planning de Livraison",
        type: "doc",
      };

    // 🚚 Expéditions & Transporteurs
    case "get_delivery_tracking":
    case "list_deliveries_for_order":
      return {
        title: "Suivi des Expéditions",
        type: "api",
      };

    case "get_delivery_stats":
      return {
        title: "Statistiques d'Acheminement",
        type: "doc",
      };

    // 📊 Stocks & Catalogue
    case "get_product_availability":
    case "get_stock_by_location":
      return {
        title: "Disponibilité des Articles",
        type: "doc",
      };

    case "get_movement_history":
      return {
        title: "Journal des Mouvements",
        type: "doc",
      };

    case "get_stock_alerts":
      return {
        title: "État des Approvisionnements",
        type: "doc",
      };

    case "get_estimated_restock":
      return {
        title: "Délais Prévisionnels",
        type: "doc",
      };

    default:
      return null;
  }
}

/**
 * Construit de façon déterministe un bloc de contenu riche (```chart``` ou
 * ```mermaid```) à partir du DTO retourné par un tool de l'agent logistique.
 * Ces blocs ne sont jamais générés par le LLM lui-même, afin de ne jamais
 * inventer de chiffres ou d'étapes non confirmées.
 *
 * @param toolName - Nom de l'outil LangChain exécuté.
 * @param output - Sortie brute / DTO retourné par l'outil.
 * @returns Le bloc markdown formaté (ex: ````chart ... ```` ou ````mermaid ... ````), ou `null` si le tool n'a pas de représentation riche associée ou si le DTO ne contient pas de données exploitables (found: false).
 */
export function buildRichContentBlock(toolName: string, output: unknown): string | null {
  switch (toolName) {
    case "get_product_availability":
      return buildProductAvailabilityChart(output as ProductAvailabilityResultDto);
    case "get_delivery_tracking":
      return buildDeliveryStatusMermaid(output as DeliveryTrackingResultDto);
    case "get_order_status":
      return buildOrderStatusMermaid(output as OrderStatusResultDto);
    default:
      return null;
  }
}

function buildProductAvailabilityChart(dto: ProductAvailabilityResultDto): string | null {
  if (!dto || !dto.found) return null;

  const chart = {
    type: "bar",
    title: `Disponibilité — ${dto.product.sku}`,
    labels: ["En stock", "Réservé", "Disponible", "Seuil sécurité"],
    datasets: [
      {
        label: dto.product.name,
        data: [
          dto.product.onHandQuantity,
          dto.product.reservedQuantity,
          dto.product.availableQuantity,
          dto.product.safetyStockQuantity ?? 0,
        ],
      },
    ],
  };

  return "\n```chart\n" + JSON.stringify(chart) + "\n```\n";
}

const DELIVERY_STEPS = ["PLANNED", "PREPARING", "READY", "IN_TRANSIT", "DELIVERED"] as const;

const DELIVERY_STEP_LABELS: Record<(typeof DELIVERY_STEPS)[number], string> = {
  PLANNED: "Planifiée",
  PREPARING: "En préparation",
  READY: "Prête",
  IN_TRANSIT: "En transit",
  DELIVERED: "Livrée",
};

function buildDeliveryStatusMermaid(dto: DeliveryTrackingResultDto): string | null {
  if (!dto || !dto.found) return null;

  const { status } = dto.delivery;
  const currentIndex = DELIVERY_STEPS.indexOf(status as (typeof DELIVERY_STEPS)[number]);
  if (currentIndex === -1) {
    // États terminaux hors chemin nominal (FAILED/RETURNED/CANCELLED) : pas
    // de diagramme de progression linéaire pertinent pour ces cas.
    return null;
  }

  const lines = ["stateDiagram-v2"];
  for (let i = 0; i < DELIVERY_STEPS.length - 1; i++) {
    lines.push(`    ${DELIVERY_STEPS[i]} --> ${DELIVERY_STEPS[i + 1]}`);
  }
  for (const step of DELIVERY_STEPS) {
    lines.push(`    ${step}: ${DELIVERY_STEP_LABELS[step]}`);
  }
  lines.push(`    note right of ${DELIVERY_STEPS[currentIndex]}: Étape actuelle`);

  return "\n```mermaid\n" + lines.join("\n") + "\n```\n";
}

const ORDER_STEPS = ["DRAFT", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

const ORDER_STEP_LABELS: Record<(typeof ORDER_STEPS)[number], string> = {
  DRAFT: "Brouillon",
  CONFIRMED: "Confirmée",
  PROCESSING: "En traitement",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
};

function buildOrderStatusMermaid(dto: OrderStatusResultDto): string | null {
  if (!dto || !dto.found || !dto.order) return null;

  const { status } = dto.order;

  // PARTIALLY_SHIPPED est mappé sur PROCESSING pour le diagramme
  const normalizedStatus = status === "PARTIALLY_SHIPPED" ? "PROCESSING" : status;

  const currentIndex = ORDER_STEPS.indexOf(normalizedStatus as (typeof ORDER_STEPS)[number]);
  if (currentIndex === -1) {
    // CANCELLED n'a pas de progression linéaire pertinente
    return null;
  }

  const lines = ["stateDiagram-v2"];
  for (let i = 0; i < ORDER_STEPS.length - 1; i++) {
    lines.push(`    ${ORDER_STEPS[i]} --> ${ORDER_STEPS[i + 1]}`);
  }
  for (const step of ORDER_STEPS) {
    lines.push(`    ${step}: ${ORDER_STEP_LABELS[step]}`);
  }
  lines.push(`    note right of ${ORDER_STEPS[currentIndex]}: Étape actuelle`);

  return "\n```mermaid\n" + lines.join("\n") + "\n```\n";
}
