import { describe, expect, it } from "vitest";
import type { LogisticsTokenUsage } from "../runtime/run-logistics-query.js";
import {
  calculateCostUsd,
  evaluateGrounding,
  GPT_5_6_LUNA_PRICING,
  GPT_5_PRICING,
  summarizeRequests,
} from "./load-test-metrics.js";

const usage = (
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): LogisticsTokenUsage => ({
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningTokens: 0,
  totalTokens: inputTokens + outputTokens,
});

describe("load-test metrics", () => {
  it("calcule le coût avec les tokens d'entrée en cache séparés", () => {
    const cost = calculateCostUsd(usage(1_000_000, 1_000_000, 200_000), {
      ...GPT_5_PRICING,
      perMillionTokens: { input: 1, cachedInput: 0.1, output: 10 },
    });

    expect(cost).toBeCloseTo(10.82);
  });

  it("embarque le tarif officiel de GPT-5.6 Luna", () => {
    expect(GPT_5_6_LUNA_PRICING.perMillionTokens).toEqual({
      input: 0.2,
      cachedInput: 0.02,
      output: 1.2,
    });
  });

  it("valide les faits réels et détecte une référence inventée", () => {
    const evaluation = evaluateGrounding({
      answer:
        "La commande CMD-2026-000001 est expédiée. La livraison LIV-2026-999999 est aussi citée.",
      expectedFacts: [
        { label: "commande", anyOf: ["CMD-2026-000001"] },
        { label: "statut", anyOf: ["SHIPPED", "expédiée"] },
      ],
      expectedTool: "get_order_status",
      toolCalls: ["get_order_status"],
      allowedReferences: ["CMD-2026-000001"],
    });

    expect(evaluation.score).toBe(1);
    expect(evaluation.hallucinationSuspected).toBe(true);
    expect(evaluation.unexpectedReferences).toEqual(["LIV-2026-999999"]);
    expect(evaluation.grounded).toBe(false);
  });

  it("ne confond pas un statut avec un statut plus long", () => {
    const evaluation = evaluateGrounding({
      answer: "CMD-2026-000001 est PARTIALLY_SHIPPED.",
      expectedFacts: [{ label: "statut", anyOf: ["SHIPPED"] }],
      expectedTool: "get_order_status",
      toolCalls: ["get_order_status"],
      allowedReferences: ["CMD-2026-000001"],
    });

    expect(evaluation.score).toBe(0);
    expect(evaluation.missingFacts).toEqual(["statut"]);
    expect(evaluation.grounded).toBe(false);
  });

  it("agrège latences, qualité, tokens et coûts", () => {
    const grounded = evaluateGrounding({
      answer: "CMD-2026-000001 confirmée",
      expectedFacts: [
        { label: "commande", anyOf: ["CMD-2026-000001"] },
        { label: "statut", anyOf: ["confirmée"] },
      ],
      expectedTool: "get_order_status",
      toolCalls: ["get_order_status"],
      allowedReferences: ["CMD-2026-000001"],
    });

    const summary = summarizeRequests([
      {
        latencyMs: 100,
        ok: true,
        tokenUsage: usage(100, 20),
        costUsd: 0.001,
        evaluation: grounded,
      },
      {
        latencyMs: 300,
        ok: true,
        tokenUsage: usage(200, 40),
        costUsd: 0.002,
        evaluation: grounded,
      },
      {
        latencyMs: 50,
        ok: false,
        tokenUsage: usage(0, 0),
        costUsd: 0,
      },
    ]);

    expect(summary.requests).toEqual({
      total: 3,
      successful: 2,
      failed: 1,
      successRate: 2 / 3,
    });
    expect(summary.latencyMs).toEqual({
      min: 50,
      average: 150,
      p50: 100,
      p95: 300,
      max: 300,
    });
    expect(summary.quality.averageScore).toBe(1);
    expect(summary.tokens.totalTokens).toBe(360);
    expect(summary.costUsd.total).toBeCloseTo(0.003);
  });
});
