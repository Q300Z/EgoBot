import { HumanMessage, type ReactAgent } from "langchain";
import type { ChatOpenAI } from "@langchain/openai";
import { createLogisticsAgent } from "../agent/index.js";
import type { LogisticsPrismaClient } from "../database/index.js";
import {
  CustomerQueryService,
  type CustomerIdentityInput,
} from "../services/index.js";

export interface RunLogisticsQueryOptions {
  prisma: LogisticsPrismaClient;
  identity: CustomerIdentityInput;
  question: string;
  /** Appelé pour chaque fragment produit par le modèle.
   *  Si absent, la réponse est retournée en bloc. */
  onToken?: (chunk: string) => void | Promise<void>;
  /** Consulté entre deux fragments ; vrai = interrompre proprement. */
  shouldCancel?: () => boolean | Promise<boolean>;
  /** Permet d'injecter un modèle, notamment un faux pour les tests. */
  model?: ChatOpenAI;
}

/** Consommation réelle remontée par le fournisseur pour tous les appels LLM. */
export interface LogisticsTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export type RunLogisticsQueryResult =
  | {
      ok: true;
      answer: string;
      toolCalls: string[];
      cancelled: boolean;
      tokenUsage: LogisticsTokenUsage;
    }
  | {
      ok: false;
      reason: "NO_IDENTITY" | "NOT_FOUND" | "INACTIVE" | "EMPTY_QUESTION";
      message: string;
    };

/** Entrée passée à l'agent : un unique message utilisateur. */
type AgentInput = { messages: HumanMessage[] };

/**
 * Point d'entrée pour un appelant externe (worker, script, tâche planifiée).
 * Il fournit une question et une identité, il reçoit une réponse — sans rien
 * connaître de LangChain, des outils, ni de la résolution d'identité.
 */
export async function runLogisticsQuery(
  options: RunLogisticsQueryOptions,
): Promise<RunLogisticsQueryResult> {
  const { prisma, identity, question, onToken, shouldCancel, model } = options;

  // 1. Question vide : on ne construit ni identité ni agent.
  if (!question || question.trim() === "") {
    return {
      ok: false,
      reason: "EMPTY_QUESTION",
      message: "Merci de préciser votre question.",
    };
  }

  // 2. Résolution de l'identité. Sans client résolu, aucun outil ne peut être
  //    construit : c'est ce filtrage qui garantit qu'un utilisateur ne voit
  //    jamais le dossier d'un autre.
  const resolution = await new CustomerQueryService(prisma).resolve(identity);
  if (!resolution.resolved) {
    return {
      ok: false,
      reason: resolution.reason,
      message: resolution.message,
    };
  }

  // 3. L'agent est reconstruit à CHAQUE appel, jamais mis en cache : les outils
  //    capturent le customerId par fermeture, un agent partagé entre deux
  //    clients serait une faille de confidentialité.
  const agent = createLogisticsAgent({
    customer: resolution.customer,
    prisma,
    model,
  });

  const input: AgentInput = { messages: [new HumanMessage(question)] };

  // 4. Sans onToken : réponse en bloc. Avec onToken : diffusion au fil de l'eau.
  if (!onToken) {
    const { answer, toolCalls, tokenUsage } = await invokeAgent(agent, input);
    return { ok: true, answer, toolCalls, cancelled: false, tokenUsage };
  }

  const streamed = await streamAgentResponse(
    agent,
    input,
    onToken,
    shouldCancel,
  );
  return { ok: true, ...streamed };
}

/** Invoque l'agent et retourne la réponse complète en un bloc. */
async function invokeAgent(
  agent: ReactAgent,
  input: AgentInput,
): Promise<{
  answer: string;
  toolCalls: string[];
  tokenUsage: LogisticsTokenUsage;
}> {
  const result = await agent.invoke(input);
  const messages = getMessages(result);
  return {
    answer: extractAnswer(result),
    toolCalls: extractToolCalls(result),
    tokenUsage: extractTokenUsage(messages),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ⚠️  SEUL ENDROIT À AJUSTER SI L'API DE STREAMING LANGCHAIN CHANGE.
//
//  Deux formes de streaming coexistent selon les versions :
//    - agent.streamEvents(input, { version: "v2" }) → événements typés,
//      on_chat_model_stream pour les fragments, on_tool_start pour les outils ;
//    - agent.stream(input, { streamMode: "messages" }) → couples [msg, meta].
//  Ici on utilise streamEvents. Si la méthode n'existe pas, on se replie sur
//  invoke puis un unique onToken : mieux vaut une réponse en bloc qu'un
//  plantage.
//
//  On ne diffuse QUE les fragments produits par le modèle. Les appels d'outils
//  et leurs résultats restent internes : l'utilisateur final n'a pas à voir
//  passer les requêtes techniques.
// ═══════════════════════════════════════════════════════════════════════════
async function streamAgentResponse(
  agent: ReactAgent,
  input: AgentInput,
  onToken: (chunk: string) => void | Promise<void>,
  shouldCancel: (() => boolean | Promise<boolean>) | undefined,
): Promise<{
  answer: string;
  toolCalls: string[];
  cancelled: boolean;
  tokenUsage: LogisticsTokenUsage;
}> {
  // Repli défensif : certaines versions n'exposent pas streamEvents.
  const streamer = agent as {
    streamEvents?: (input: AgentInput, options: { version: "v2" }) => AsyncIterable<StreamEventLike>;
  };
  if (typeof streamer.streamEvents !== "function") {
    const { answer, toolCalls, tokenUsage } = await invokeAgent(agent, input);
    await onToken(answer);
    return { answer, toolCalls, cancelled: false, tokenUsage };
  }

  const toolCalls: string[] = [];
  let answer = "";
  const tokenUsage = emptyTokenUsage();

  for await (const event of streamer.streamEvents(input, { version: "v2" })) {
    // Consulté entre deux fragments : interruption propre.
    if (shouldCancel && (await shouldCancel())) {
      return { answer, toolCalls, cancelled: true, tokenUsage };
    }

    if (event.event === "on_tool_start") {
      if (event.name) toolCalls.push(event.name);
      continue;
    }

    // Un agent peut appeler le modèle plusieurs fois (sélection d'un outil,
    // puis formulation finale). Chaque fin d'appel porte sa propre consommation.
    if (event.event === "on_chat_model_end") {
      addTokenUsage(tokenUsage, extractTokenUsage([event.data?.output]));
      continue;
    }

    if (event.event === "on_chat_model_stream") {
      const chunk = normalizeContent(event.data?.chunk?.content);
      if (chunk) {
        answer += chunk;
        await onToken(chunk);
      }
    }
  }

  return { answer, toolCalls, cancelled: false, tokenUsage };
}

/** Forme minimale d'un événement streamEvents v2 réellement consommée ici. */
interface StreamEventLike {
  event: string;
  name?: string;
  data?: { chunk?: { content?: unknown }; output?: unknown };
}

function emptyTokenUsage(): LogisticsTokenUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
}

function toTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function addTokenUsage(
  target: LogisticsTokenUsage,
  usage: LogisticsTokenUsage,
): void {
  target.inputTokens += usage.inputTokens;
  target.cachedInputTokens += usage.cachedInputTokens;
  target.outputTokens += usage.outputTokens;
  target.reasoningTokens += usage.reasoningTokens;
  target.totalTokens += usage.totalTokens;
}

/**
 * Additionne les métadonnées de tous les messages IA d'un run agentique.
 * `usage_metadata` est la forme LangChain actuelle ; `tokenUsage` conserve la
 * compatibilité avec les réponses OpenAI exposant encore les noms historiques.
 */
export function extractTokenUsage(messages: unknown[]): LogisticsTokenUsage {
  const total = emptyTokenUsage();

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    const usage = record.usage_metadata;

    if (usage && typeof usage === "object") {
      const metadata = usage as Record<string, unknown>;
      const inputDetails =
        metadata.input_token_details &&
        typeof metadata.input_token_details === "object"
          ? (metadata.input_token_details as Record<string, unknown>)
          : {};
      const outputDetails =
        metadata.output_token_details &&
        typeof metadata.output_token_details === "object"
          ? (metadata.output_token_details as Record<string, unknown>)
          : {};

      const inputTokens = toTokenCount(metadata.input_tokens);
      const outputTokens = toTokenCount(metadata.output_tokens);
      const messageTotal = toTokenCount(metadata.total_tokens);

      total.inputTokens += inputTokens;
      total.cachedInputTokens += toTokenCount(inputDetails.cache_read);
      total.outputTokens += outputTokens;
      total.reasoningTokens += toTokenCount(outputDetails.reasoning);
      total.totalTokens += messageTotal || inputTokens + outputTokens;
      continue;
    }

    const responseMetadata = record.response_metadata;
    if (!responseMetadata || typeof responseMetadata !== "object") continue;
    const legacy = (responseMetadata as Record<string, unknown>).tokenUsage;
    if (!legacy || typeof legacy !== "object") continue;
    const tokenUsage = legacy as Record<string, unknown>;
    const inputTokens = toTokenCount(tokenUsage.promptTokens);
    const outputTokens = toTokenCount(tokenUsage.completionTokens);
    const messageTotal = toTokenCount(tokenUsage.totalTokens);

    total.inputTokens += inputTokens;
    total.outputTokens += outputTokens;
    total.totalTokens += messageTotal || inputTokens + outputTokens;
  }
  return total;
}

/**
 * Normalise le contenu d'un message : `content` peut être une chaîne, ou un
 * tableau de blocs `{ type: "text", text: string }` selon le modèle.
 */
function normalizeContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        block &&
        typeof block === "object" &&
        "text" in block &&
        typeof (block as { text: unknown }).text === "string"
          ? (block as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

/** Extrait la réponse finale : le contenu du dernier message. */
function extractAnswer(result: unknown): string {
  const messages = getMessages(result);
  if (messages.length === 0) {
    return "";
  }
  const last = messages[messages.length - 1] as { content?: unknown };
  return normalizeContent(last?.content);
}

/**
 * Liste les outils réellement appelés. Une réponse sans aucun appel d'outil
 * n'est pas sourcée : l'appelant doit pouvoir le détecter.
 */
function extractToolCalls(result: unknown): string[] {
  const names: string[] = [];
  for (const message of getMessages(result)) {
    const toolCalls = (message as { tool_calls?: Array<{ name?: string }> })
      ?.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        if (call?.name) names.push(call.name);
      }
    }
  }
  return names;
}

function getMessages(result: unknown): unknown[] {
  const messages = (result as { messages?: unknown })?.messages;
  return Array.isArray(messages) ? messages : [];
}
