/**
 * Banc de charge du véritable agent logistique.
 *
 * Exemple :
 *   pnpm test:load -- --users 10 --requests-per-user 3
 *
 * Chaque utilisateur virtuel envoie ses requêtes séquentiellement, tandis que
 * les utilisateurs s'exécutent en parallèle. Les cas sont construits depuis
 * les commandes et livraisons réellement présentes dans la base de mock.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  calculateCostUsd,
  evaluateGrounding,
  GPT_5_6_LUNA_PRICING,
  GPT_5_PRICING,
  summarizeRequests,
  type ExpectedFact,
  type MeasuredRequest,
  type ModelPricing,
} from "../src/evaluation/index.js";
import {
  createPrismaClient,
  runLogisticsQuery,
  type LogisticsTokenUsage,
} from "../src/index.js";

interface LoadTestConfig {
  virtualUsers: number;
  requestsPerUser: number;
  thinkTimeMs: number;
  reportPath: string;
}

interface Scenario {
  name: "order_status" | "delivery_tracking";
  question: string;
  expectedAnswer: string;
  expectedFacts: ExpectedFact[];
  expectedTool: string;
  allowedReferences: string[];
}

interface CustomerFixture {
  id: string;
  customerNumber: string;
  email: string;
  orders: Array<{
    orderNumber: string;
    status: string;
    deliveries: Array<{
      deliveryNumber: string;
      status: string;
    }>;
  }>;
}

interface RequestReport extends MeasuredRequest {
  requestId: string;
  virtualUser: number;
  customerNumber: string;
  scenario: Scenario["name"];
  question: string;
  expected: {
    source: "database";
    answer: string;
    facts: ExpectedFact[];
    tool: string;
    allowedReferences: string[];
  };
  comparison: {
    verdict: "MATCH" | "MISMATCH" | "ERROR";
    receivedAnswer: string;
    expectedAnswer: string;
    matchedFacts: string[];
    missingFacts: string[];
    expectedTool: string;
    receivedTools: string[];
    unexpectedReferences: string[];
  };
  answer?: string;
  toolCalls: string[];
  error?: string;
}

const EMPTY_USAGE: LogisticsTokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

const STATUS_LABELS: Record<string, string[]> = {
  DRAFT: ["DRAFT", "brouillon"],
  CONFIRMED: ["CONFIRMED", "confirmée", "confirmee"],
  PROCESSING: ["PROCESSING", "en traitement", "en préparation"],
  PARTIALLY_SHIPPED: [
    "PARTIALLY_SHIPPED",
    "partiellement expédiée",
    "partiellement expediee",
  ],
  SHIPPED: ["SHIPPED", "expédiée", "expediee"],
  DELIVERED: ["DELIVERED", "livrée", "livree"],
  CANCELLED: ["CANCELLED", "annulée", "annulee"],
  PLANNED: ["PLANNED", "planifiée", "planifiee", "prévue"],
  PREPARING: ["PREPARING", "en préparation", "en cours de préparation"],
  READY: ["READY", "prête", "prete"],
  IN_TRANSIT: ["IN_TRANSIT", "en transit", "en cours d'acheminement"],
  FAILED: ["FAILED", "échouée", "echouee", "échec"],
  RETURNED: ["RETURNED", "retournée", "retournee"],
};

function fail(message: string): never {
  throw new Error(message);
}

function integerOption(
  args: string[],
  flag: string,
  environmentName: string,
  fallback: number,
  allowZero = false,
): number {
  const flagIndex = args.indexOf(flag);
  const raw =
    flagIndex >= 0 ? args[flagIndex + 1] : process.env[environmentName];
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < minimum) {
    fail(`${flag} doit être un entier supérieur ou égal à ${minimum}.`);
  }
  return parsed;
}

function stringOption(
  args: string[],
  flag: string,
  environmentName: string,
  fallback: string,
): string {
  const flagIndex = args.indexOf(flag);
  return (
    (flagIndex >= 0 ? args[flagIndex + 1] : process.env[environmentName]) ??
    fallback
  );
}

function parseConfig(args: string[]): LoadTestConfig {
  if (args.includes("--help")) {
    console.log(`Usage: pnpm test:load -- [options]

Options:
  --users N                 utilisateurs virtuels concurrents (défaut: 5)
  --requests-per-user N     requêtes séquentielles par utilisateur (défaut: 2)
  --think-time-ms N         pause entre deux requêtes d'un utilisateur (défaut: 0)
  --report PATH             chemin du rapport JSON

Variables équivalentes: LOAD_TEST_USERS, LOAD_TEST_REQUESTS_PER_USER,
LOAD_TEST_THINK_TIME_MS et LOAD_TEST_REPORT.`);
    process.exit(0);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    virtualUsers: integerOption(args, "--users", "LOAD_TEST_USERS", 5),
    requestsPerUser: integerOption(
      args,
      "--requests-per-user",
      "LOAD_TEST_REQUESTS_PER_USER",
      2,
    ),
    thinkTimeMs: integerOption(
      args,
      "--think-time-ms",
      "LOAD_TEST_THINK_TIME_MS",
      0,
      true,
    ),
    reportPath: resolve(
      stringOption(
        args,
        "--report",
        "LOAD_TEST_REPORT",
        `reports/logistics-load-test-${timestamp}.json`,
      ),
    ),
  };
}

function customPricing(model: string): ModelPricing | null {
  const values = [
    process.env.LOAD_TEST_INPUT_USD_PER_MILLION,
    process.env.LOAD_TEST_CACHED_INPUT_USD_PER_MILLION,
    process.env.LOAD_TEST_OUTPUT_USD_PER_MILLION,
  ];
  if (values.every((value) => value === undefined)) return null;
  if (values.some((value) => value === undefined)) {
    fail(
      "Les trois tarifs LOAD_TEST_*_USD_PER_MILLION doivent être renseignés ensemble.",
    );
  }

  const [input, cachedInput, output] = values.map(Number);
  if ([input, cachedInput, output].some((value) => !Number.isFinite(value) || value < 0)) {
    fail("Les tarifs LOAD_TEST_*_USD_PER_MILLION doivent être des nombres positifs.");
  }

  return {
    model,
    currency: "USD",
    perMillionTokens: { input, cachedInput, output },
    source: process.env.LOAD_TEST_PRICING_SOURCE ?? "configuration manuelle",
    verifiedAt:
      process.env.LOAD_TEST_PRICING_VERIFIED_AT ??
      new Date().toISOString().slice(0, 10),
  };
}

function resolvePricing(model: string): ModelPricing {
  const configured = customPricing(model);
  if (configured) return configured;

  if (model === "gpt-5" || model === "gpt-5-2025-08-07") {
    return { ...GPT_5_PRICING, model };
  }

  if (model === "gpt-5.6-luna") {
    return GPT_5_6_LUNA_PRICING;
  }

  fail(
    `Aucun tarif vérifié n'est embarqué pour ${model}. ` +
      "Renseignez LOAD_TEST_INPUT_USD_PER_MILLION, " +
      "LOAD_TEST_CACHED_INPUT_USD_PER_MILLION et " +
      "LOAD_TEST_OUTPUT_USD_PER_MILLION.",
  );
}

function assertModelConfiguration(): void {
  const provider = process.env.LOGISTICS_MODEL_PROVIDER ?? "openai";
  if (provider === "azure") {
    if (!process.env.AZURE_OPENAI_API_KEY) {
      fail("AZURE_OPENAI_API_KEY est requis pour lancer le banc de charge Azure.");
    }
    return;
  }
  if (provider !== "openai") {
    fail(`LOGISTICS_MODEL_PROVIDER inconnu : ${provider}.`);
  }
  if (!process.env.OPENAI_API_KEY) {
    fail("OPENAI_API_KEY est requis pour lancer le banc de charge OpenAI.");
  }
}

function statusFacts(status: string): string[] {
  return STATUS_LABELS[status] ?? [status];
}

function buildScenarios(customer: CustomerFixture): Scenario[] {
  const scenarios: Scenario[] = [];

  for (const order of customer.orders) {
    scenarios.push({
      name: "order_status",
      question: `Quel est le statut de ma commande ${order.orderNumber} ?`,
      expectedAnswer: `La commande ${order.orderNumber} a le statut ${order.status}.`,
      expectedFacts: [
        { label: "référence commande", anyOf: [order.orderNumber] },
        { label: "statut commande", anyOf: statusFacts(order.status) },
      ],
      expectedTool: "get_order_status",
      allowedReferences: [
        order.orderNumber,
        ...order.deliveries.map((delivery) => delivery.deliveryNumber),
      ],
    });

    for (const delivery of order.deliveries) {
      scenarios.push({
        name: "delivery_tracking",
        question: `Où en est ma livraison ${delivery.deliveryNumber} ?`,
        expectedAnswer: `La livraison ${delivery.deliveryNumber} a le statut ${delivery.status}.`,
        expectedFacts: [
          { label: "référence livraison", anyOf: [delivery.deliveryNumber] },
          { label: "statut livraison", anyOf: statusFacts(delivery.status) },
        ],
        expectedTool: "get_delivery_tracking",
        allowedReferences: [order.orderNumber, delivery.deliveryNumber],
      });
    }
  }

  return scenarios;
}

const wait = (durationMs: number) =>
  new Promise<void>((resolveWait) => setTimeout(resolveWait, durationMs));

function csvCell(value: unknown): string {
  const text = (Array.isArray(value) ? value.join(", ") : String(value ?? ""))
    .replace(/\r?\n/g, " ↵ ")
    .replace(/\s+/g, " ")
    .trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function buildComparisonCsv(requests: RequestReport[]): string {
  const headers = [
    "verdict",
    "request_id",
    "utilisateur_virtuel",
    "client",
    "scenario",
    "question",
    "reponse_recue",
    "reponse_attendue_db",
    "faits_valides",
    "faits_manquants",
    "outil_attendu",
    "outils_appeles",
    "references_inattendues",
    "score_qualite_pct",
    "reponse_fondee",
    "hallucination_suspectee",
    "erreur",
    "latence_ms",
    "tokens_entree",
    "tokens_entree_cache",
    "tokens_sortie",
    "tokens_raisonnement",
    "tokens_total",
    "cout_usd",
  ];
  const rows = requests.map((request) => [
    request.comparison.verdict,
    request.requestId,
    request.virtualUser,
    request.customerNumber,
    request.scenario,
    request.question,
    request.comparison.receivedAnswer,
    request.comparison.expectedAnswer,
    request.comparison.matchedFacts,
    request.comparison.missingFacts,
    request.comparison.expectedTool,
    request.comparison.receivedTools,
    request.comparison.unexpectedReferences,
    request.evaluation ? (request.evaluation.score * 100).toFixed(1) : "",
    request.evaluation?.grounded ?? false,
    request.evaluation?.hallucinationSuspected ?? false,
    request.error ?? "",
    request.latencyMs.toFixed(2),
    request.tokenUsage.inputTokens,
    request.tokenUsage.cachedInputTokens,
    request.tokenUsage.outputTokens,
    request.tokenUsage.reasoningTokens,
    request.tokenUsage.totalTokens,
    request.costUsd.toFixed(8),
  ]);

  // BOM UTF-8 + séparateur point-virgule : ouverture directe dans Excel FR.
  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\n")}\n`;
}

async function main() {
  const config = parseConfig(process.argv.slice(2));
  assertModelConfiguration();

  const model = process.env.LOGISTICS_MODEL ?? "gpt-5";
  const pricing = resolvePricing(model);
  const prisma = createPrismaClient();
  const startedAt = new Date();

  try {
    const customers = (await prisma.customer.findMany({
      where: { isActive: true, orders: { some: {} } },
      orderBy: { customerNumber: "asc" },
      select: {
        id: true,
        customerNumber: true,
        email: true,
        orders: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 20,
          select: {
            orderNumber: true,
            status: true,
            deliveries: {
              orderBy: { createdAt: "asc" },
              select: { deliveryNumber: true, status: true },
            },
          },
        },
      },
    })) as CustomerFixture[];

    if (customers.length === 0) {
      fail(
        "Aucun client actif avec commande n'est disponible. Exécutez prisma:seed avant le test.",
      );
    }

    console.log(
      `Banc de charge: ${config.virtualUsers} utilisateurs × ` +
        `${config.requestsPerUser} requêtes, modèle ${model}.`,
    );

    const wallStart = performance.now();
    const userRuns = Array.from(
      { length: config.virtualUsers },
      async (_, userIndex): Promise<RequestReport[]> => {
        const customer = customers[userIndex % customers.length]!;
        const scenarios = buildScenarios(customer);
        if (scenarios.length === 0) return [];

        const results: RequestReport[] = [];
        for (let requestIndex = 0; requestIndex < config.requestsPerUser; requestIndex += 1) {
          const scenario = scenarios[(userIndex + requestIndex) % scenarios.length]!;
          const requestId = `vu-${userIndex + 1}-req-${requestIndex + 1}`;
          const expected = {
            source: "database" as const,
            answer: scenario.expectedAnswer,
            facts: scenario.expectedFacts,
            tool: scenario.expectedTool,
            allowedReferences: scenario.allowedReferences,
          };
          const requestStart = performance.now();

          try {
            const result = await runLogisticsQuery({
              prisma,
              identity: { customerId: customer.id, email: customer.email },
              question: scenario.question,
            });
            const latencyMs = performance.now() - requestStart;

            if (!result.ok) {
              results.push({
                requestId,
                virtualUser: userIndex + 1,
                customerNumber: customer.customerNumber,
                scenario: scenario.name,
                question: scenario.question,
                expected,
                comparison: {
                  verdict: "ERROR",
                  receivedAnswer: "",
                  expectedAnswer: scenario.expectedAnswer,
                  matchedFacts: [],
                  missingFacts: scenario.expectedFacts.map((fact) => fact.label),
                  expectedTool: scenario.expectedTool,
                  receivedTools: [],
                  unexpectedReferences: [],
                },
                latencyMs,
                ok: false,
                tokenUsage: { ...EMPTY_USAGE },
                costUsd: 0,
                toolCalls: [],
                error: `${result.reason}: ${result.message}`,
              });
            } else {
              const evaluation = evaluateGrounding({
                answer: result.answer,
                expectedFacts: scenario.expectedFacts,
                expectedTool: scenario.expectedTool,
                toolCalls: result.toolCalls,
                allowedReferences: scenario.allowedReferences,
              });
              results.push({
                requestId,
                virtualUser: userIndex + 1,
                customerNumber: customer.customerNumber,
                scenario: scenario.name,
                question: scenario.question,
                expected,
                comparison: {
                  verdict: evaluation.grounded ? "MATCH" : "MISMATCH",
                  receivedAnswer: result.answer,
                  expectedAnswer: scenario.expectedAnswer,
                  matchedFacts: evaluation.matchedFacts,
                  missingFacts: evaluation.missingFacts,
                  expectedTool: scenario.expectedTool,
                  receivedTools: result.toolCalls,
                  unexpectedReferences: evaluation.unexpectedReferences,
                },
                latencyMs,
                ok: true,
                tokenUsage: result.tokenUsage,
                costUsd: calculateCostUsd(result.tokenUsage, pricing),
                evaluation,
                answer: result.answer,
                toolCalls: result.toolCalls,
              });
            }
          } catch (error) {
            results.push({
              requestId,
              virtualUser: userIndex + 1,
              customerNumber: customer.customerNumber,
              scenario: scenario.name,
              question: scenario.question,
              expected,
              comparison: {
                verdict: "ERROR",
                receivedAnswer: "",
                expectedAnswer: scenario.expectedAnswer,
                matchedFacts: [],
                missingFacts: scenario.expectedFacts.map((fact) => fact.label),
                expectedTool: scenario.expectedTool,
                receivedTools: [],
                unexpectedReferences: [],
              },
              latencyMs: performance.now() - requestStart,
              ok: false,
              tokenUsage: { ...EMPTY_USAGE },
              costUsd: 0,
              toolCalls: [],
              error: error instanceof Error ? error.message : String(error),
            });
          }

          const current = results.at(-1)!;
          console.log(
            `[${requestId}] ${current.ok ? "OK" : "ERREUR"} ` +
              `${current.latencyMs.toFixed(0)} ms`,
          );
          if (
            config.thinkTimeMs > 0 &&
            requestIndex + 1 < config.requestsPerUser
          ) {
            await wait(config.thinkTimeMs);
          }
        }
        return results;
      },
    );

    const requests = (await Promise.all(userRuns)).flat();
    const durationMs = performance.now() - wallStart;
    const finishedAt = new Date();
    const summary = summarizeRequests(requests);
    const comparisonPath = config.reportPath.replace(/\.json$/i, "") +
      "-comparisons.csv";
    const mismatches = requests.filter(
      (request) => request.comparison.verdict !== "MATCH",
    ).length;
    const report = {
      schemaVersion: 1,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      execution: {
        virtualUsers: config.virtualUsers,
        requestsPerUser: config.requestsPerUser,
        plannedRequests: config.virtualUsers * config.requestsPerUser,
        executedRequests: requests.length,
        thinkTimeMs: config.thinkTimeMs,
        durationMs,
        requestsPerSecond: durationMs === 0 ? 0 : requests.length / (durationMs / 1_000),
      },
      model: {
        provider: process.env.LOGISTICS_MODEL_PROVIDER ?? "openai",
        name: model,
        pricing,
        costIsEstimate: true,
      },
      comparison: {
        matched: requests.length - mismatches,
        mismatches,
        csvPath: comparisonPath,
      },
      summary,
      requests,
    };

    await mkdir(dirname(config.reportPath), { recursive: true });
    await writeFile(config.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(comparisonPath, buildComparisonCsv(requests), "utf8");

    console.log("\nRésumé");
    console.log(`  Requêtes réussies : ${summary.requests.successful}/${summary.requests.total}`);
    console.log(`  Latence moyenne   : ${summary.latencyMs.average.toFixed(0)} ms`);
    console.log(`  Latence min / max : ${summary.latencyMs.min.toFixed(0)} / ${summary.latencyMs.max.toFixed(0)} ms`);
    console.log(`  p50 / p95         : ${summary.latencyMs.p50.toFixed(0)} / ${summary.latencyMs.p95.toFixed(0)} ms`);
    console.log(`  Qualité moyenne   : ${(summary.quality.averageScore * 100).toFixed(1)} %`);
    console.log(`  Réponses fondées  : ${summary.quality.groundedResponses}/${summary.quality.evaluated}`);
    console.log(`  Hallucinations    : ${summary.quality.hallucinationsSuspected}`);
    console.log(`  Comparaisons KO   : ${mismatches}`);
    console.log(`  Tokens            : ${summary.tokens.totalTokens}`);
    console.log(`  Coût estimé       : $${summary.costUsd.total.toFixed(6)} USD`);
    console.log(`  Débit              : ${report.execution.requestsPerSecond.toFixed(2)} req/s`);
    console.log(`  Rapport JSON       : ${config.reportPath}`);
    console.log(`  Comparatif Excel   : ${comparisonPath}`);

    if (summary.requests.failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/table [`'"]?main\.Customer|P2021/i.test(message)) {
    console.error(
      "La base logistique n'est pas initialisée. Exécutez :\n" +
        "  pnpm exec prisma migrate deploy\n" +
        "  pnpm exec prisma db seed",
    );
  } else {
    console.error(message);
  }
  process.exitCode = 1;
}
