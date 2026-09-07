import type {
  DeliveryTrackingResultDto,
  ProductAvailabilityResultDto,
} from "@egobot/logistics-agent/dtos";

/**
 * Construit de façon déterministe un bloc de contenu riche (```chart``` ou
 * ```mermaid```) à partir du DTO retourné par un tool de l'agent logistique.
 * Ces blocs ne sont jamais générés par le LLM lui-même, afin de ne jamais
 * inventer de chiffres ou d'étapes non confirmées.
 *
 * Retourne null si le tool n'a pas de représentation riche associée ou si le
 * DTO ne contient pas de données exploitables (found: false).
 */
export function buildRichContentBlock(toolName: string, output: unknown): string | null {
  switch (toolName) {
    case "get_product_availability":
      return buildProductAvailabilityChart(output as ProductAvailabilityResultDto);
    case "get_delivery_tracking":
      return buildDeliveryStatusMermaid(output as DeliveryTrackingResultDto);
    default:
      return null;
  }
}

function buildProductAvailabilityChart(dto: ProductAvailabilityResultDto): string | null {
  if (!dto || !dto.found) return null;

  const chart = {
    type: "bar",
    title: `Disponibilité — ${dto.product.sku}`,
    labels: ["En stock", "Réservé", "Disponible"],
    datasets: [
      {
        label: dto.product.name,
        data: [
          dto.product.onHandQuantity,
          dto.product.reservedQuantity,
          dto.product.availableQuantity,
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
