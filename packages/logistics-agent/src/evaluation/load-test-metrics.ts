import type { LogisticsTokenUsage } from "../runtime/run-logistics-query.js";

export interface ModelPricing {
  model: string;
  currency: "USD";
  perMillionTokens: {
    input: number;
    cachedInput: number;
    output: number;
  };
  source: string;
  verifiedAt: string;
}

export interface ExpectedFact {
  label: string;
  /** Une seule des formulations doit être présente dans la réponse. */
  anyOf: string[];
}

export interface GroundingEvaluation {
  score: number;
  matchedFacts: string[];
  missingFacts: string[];
  expectedToolUsed: boolean;
  unexpectedReferences: string[];
  grounded: boolean;
  hallucinationSuspected: boolean;
}

export interface MeasuredRequest {
  latencyMs: number;
  ok: boolean;
  tokenUsage: LogisticsTokenUsage;
  costUsd: number;
  evaluation?: GroundingEvaluation;
}

export interface LoadTestSummary {
  requests: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
  latencyMs: {
    min: number;
    average: number;
    p50: number;
    p95: number;
    max: number;
  };
  quality: {
    evaluated: number;
    averageScore: number;
    groundedResponses: number;
    hallucinationsSuspected: number;
  };
  tokens: LogisticsTokenUsage & {
    measuredResponses: number;
    averagePerSuccessfulResponse: number;
  };
  costUsd: {
    total: number;
    averagePerSuccessfulResponse: number;
  };
}

const EMPTY_USAGE: LogisticsTokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

/** Tarifs OpenAI GPT-5 standard, en USD par million de tokens. */
export const GPT_5_PRICING: ModelPricing = {
  model: "gpt-5",
  currency: "USD",
  perMillionTokens: {
    input: 1.25,
    cachedInput: 0.125,
    output: 10,
  },
  source: "https://developers.openai.com/api/docs/models/gpt-5",
  verifiedAt: "2026-09-08",
};

/** Tarifs OpenAI GPT-5.6 Luna standard, en USD par million de tokens. */
export const GPT_5_6_LUNA_PRICING: ModelPricing = {
  model: "gpt-5.6-luna",
  currency: "USD",
  perMillionTokens: {
    input: 0.2,
    cachedInput: 0.02,
    output: 1.2,
  },
  source: "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
  verifiedAt: "2026-09-08",
};

export function calculateCostUsd(
  usage: LogisticsTokenUsage,
  pricing: ModelPricing,
): number {
  const cachedInput = Math.min(
    Math.max(usage.cachedInputTokens, 0),
    Math.max(usage.inputTokens, 0),
  );
  const uncachedInput = Math.max(usage.inputTokens - cachedInput, 0);

  return (
    (uncachedInput * pricing.perMillionTokens.input +
      cachedInput * pricing.perMillionTokens.cachedInput +
      Math.max(usage.outputTokens, 0) * pricing.perMillionTokens.output) /
    1_000_000
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ")
    .trim();
}

function containsFact(normalizedAnswer: string, candidate: string): boolean {
  const normalizedCandidate = normalize(candidate);
  if (!normalizedCandidate) return false;
  const escaped = normalizedCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Les bornes empêchent par exemple SHIPPED de valider à tort une réponse
  // qui contient uniquement PARTIALLY_SHIPPED.
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`,
    "u",
  ).test(normalizedAnswer);
}

function extractBusinessReferences(answer: string): string[] {
  const matches = answer.match(/\b(?:CMD|LIV)-[A-Z0-9-]+\b/gi) ?? [];
  return [...new Set(matches.map((reference) => reference.toUpperCase()))];
}

/**
 * Évaluation déterministe : présence des faits lus en base, outil métier appelé
 * et absence de référence commande/livraison hors du périmètre du client.
 */
export function evaluateGrounding(options: {
  answer: string;
  expectedFacts: ExpectedFact[];
  expectedTool: string;
  toolCalls: string[];
  allowedReferences: string[];
}): GroundingEvaluation {
  const normalizedAnswer = normalize(options.answer);
  const matchedFacts: string[] = [];
  const missingFacts: string[] = [];

  for (const fact of options.expectedFacts) {
    const matched = fact.anyOf.some((candidate) =>
      containsFact(normalizedAnswer, candidate),
    );
    (matched ? matchedFacts : missingFacts).push(fact.label);
  }

  const allowed = new Set(
    options.allowedReferences.map((reference) => reference.toUpperCase()),
  );
  const unexpectedReferences = extractBusinessReferences(options.answer).filter(
    (reference) => !allowed.has(reference),
  );
  const expectedToolUsed = options.toolCalls.includes(options.expectedTool);
  const score =
    options.expectedFacts.length === 0
      ? 0
      : matchedFacts.length / options.expectedFacts.length;

  return {
    score,
    matchedFacts,
    missingFacts,
    expectedToolUsed,
    unexpectedReferences,
    grounded:
      score === 1 && expectedToolUsed && unexpectedReferences.length === 0,
    hallucinationSuspected: unexpectedReferences.length > 0,
  };
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(
    0,
    Math.ceil((percentileValue / 100) * sortedValues.length) - 1,
  );
  return sortedValues[index] ?? 0;
}

export function summarizeRequests(
  requests: MeasuredRequest[],
): LoadTestSummary {
  const successful = requests.filter((request) => request.ok);
  const evaluated = successful.flatMap((request) =>
    request.evaluation ? [request.evaluation] : [],
  );
  // Une requête en erreur consomme elle aussi du temps côté utilisateur : elle
  // doit donc rester dans les percentiles et les extrema de charge.
  const latencies = requests
    .map((request) => request.latencyMs)
    .sort((left, right) => left - right);
  const tokenUsage = successful.reduce<LogisticsTokenUsage>(
    (total, request) => ({
      inputTokens: total.inputTokens + request.tokenUsage.inputTokens,
      cachedInputTokens:
        total.cachedInputTokens + request.tokenUsage.cachedInputTokens,
      outputTokens: total.outputTokens + request.tokenUsage.outputTokens,
      reasoningTokens:
        total.reasoningTokens + request.tokenUsage.reasoningTokens,
      totalTokens: total.totalTokens + request.tokenUsage.totalTokens,
    }),
    { ...EMPTY_USAGE },
  );
  const measuredResponses = successful.filter(
    (request) => request.tokenUsage.totalTokens > 0,
  ).length;
  const totalCost = successful.reduce(
    (sum, request) => sum + request.costUsd,
    0,
  );

  return {
    requests: {
      total: requests.length,
      successful: successful.length,
      failed: requests.length - successful.length,
      successRate:
        requests.length === 0 ? 0 : successful.length / requests.length,
    },
    latencyMs: {
      min: latencies.at(0) ?? 0,
      average: average(latencies),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.at(-1) ?? 0,
    },
    quality: {
      evaluated: evaluated.length,
      averageScore: average(evaluated.map((item) => item.score)),
      groundedResponses: evaluated.filter((item) => item.grounded).length,
      hallucinationsSuspected: evaluated.filter(
        (item) => item.hallucinationSuspected,
      ).length,
    },
    tokens: {
      ...tokenUsage,
      measuredResponses,
      averagePerSuccessfulResponse:
        successful.length === 0
          ? 0
          : tokenUsage.totalTokens / successful.length,
    },
    costUsd: {
      total: totalCost,
      averagePerSuccessfulResponse:
        successful.length === 0 ? 0 : totalCost / successful.length,
    },
  };
}
