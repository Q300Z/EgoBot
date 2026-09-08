import { describe, it } from "node:test";
import assert from "node:assert";
import { buildRichContentBlock } from "./build-rich-content-block.js";

describe("buildRichContentBlock", () => {
  describe("get_product_availability", () => {
    it("devrait produire un bloc ```chart``` valide quand le produit est trouvé", () => {
      const block = buildRichContentBlock("get_product_availability", {
        found: true,
        product: {
          sku: "SKU-001",
          name: "Carton",
          isAvailable: true,
          onHandQuantity: 120,
          reservedQuantity: 30,
          availableQuantity: 90,
        },
      });

      assert.ok(block);
      assert.match(block!, /```chart/);
      const jsonMatch = block!.match(/```chart\n([\s\S]*?)\n```/);
      assert.ok(jsonMatch);
      const parsed = JSON.parse(jsonMatch![1]!);
      assert.strictEqual(parsed.type, "bar");
      assert.deepStrictEqual(parsed.datasets[0].data, [120, 30, 90, 0]);
    });

    it("devrait retourner null quand le produit n'est pas trouvé", () => {
      const block = buildRichContentBlock("get_product_availability", {
        found: false,
        message: "Article actif introuvable.",
      });
      assert.strictEqual(block, null);
    });
  });

  describe("get_delivery_tracking", () => {
    it("devrait produire un bloc ```mermaid``` pour un statut nominal", () => {
      const block = buildRichContentBlock("get_delivery_tracking", {
        found: true,
        delivery: {
          deliveryNumber: "LIV-2026-0001",
          status: "IN_TRANSIT",
          carrierName: "Colissimo",
          trackingNumber: "TRACK-0001",
          trackingUrl: null,
          plannedShipmentAt: null,
          shippedAt: null,
          estimatedDeliveryAt: null,
          deliveredAt: null,
          orderNumber: "CMD-2026-0001",
          contents: [],
        },
      });

      assert.ok(block);
      assert.match(block!, /```mermaid/);
      assert.match(block!, /stateDiagram-v2/);
      assert.match(block!, /IN_TRANSIT/);
    });

    it("devrait retourner null pour un statut terminal hors chemin nominal (CANCELLED)", () => {
      const block = buildRichContentBlock("get_delivery_tracking", {
        found: true,
        delivery: {
          deliveryNumber: "LIV-2026-0002",
          status: "CANCELLED",
          carrierName: null,
          trackingNumber: null,
          trackingUrl: null,
          plannedShipmentAt: null,
          shippedAt: null,
          estimatedDeliveryAt: null,
          deliveredAt: null,
          orderNumber: "CMD-2026-0002",
          contents: [],
        },
      });
      assert.strictEqual(block, null);
    });

    it("devrait retourner null quand la livraison n'est pas trouvée", () => {
      const block = buildRichContentBlock("get_delivery_tracking", {
        found: false,
        message: "Livraison introuvable pour le client authentifié.",
      });
      assert.strictEqual(block, null);
    });
  });

  it("devrait retourner null pour un tool non mappé", () => {
    const block = buildRichContentBlock("get_order_status", { found: true });
    assert.strictEqual(block, null);
  });
});
