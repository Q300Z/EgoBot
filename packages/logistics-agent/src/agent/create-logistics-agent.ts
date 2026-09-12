import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";
import {
  createAgent,
  modelCallLimitMiddleware,
  toolCallLimitMiddleware,
  type ReactAgent,
} from "langchain";
import type { LogisticsPrismaClient } from "../database/index.js";
import type { AuthenticatedCustomer } from "../dtos/index.js";
import { createLogisticsTools } from "../tools/index.js";
import { LOGISTICS_SYSTEM_PROMPT } from "./system-prompt.js";

export type LogisticsModelProvider = "openai" | "azure";

/**
 * Paramètres de configuration pour la création d'une instance de ReactAgent logistique.
 */
export interface CreateLogisticsAgentOptions {
  /** Informations sur le client connecté pour scoper ses données. */
  customer: AuthenticatedCustomer;
  /** Instance du client Prisma connecté à la BDD SQLite logistique. */
  prisma: LogisticsPrismaClient;
  /**
   * Outils complémentaires personnalisés à injecter dans l'agent en plus des 19 outils logistiques de base.
   * Permet d'étendre facilement l'agent avec des sources de données externes (APIs tierces, ERP, etc.).
   */
  extraTools?: StructuredToolInterface[];
  /**
   * Modèle de chat LangChain à utiliser (ChatOpenAI, AzureChatOpenAI, etc.).
   * Si omis, le modèle par défaut est construit selon `modelProvider`.
   */
  model?: BaseChatModel;
  /**
   * Fournisseur du modèle par défaut lorsque `model` n'est pas fourni.
   * Lu depuis `LOGISTICS_MODEL_PROVIDER` ("openai" ou "azure").
   * La configuration Azure (clé, instance ou endpoint, déploiement, version
   * d'API) est lue depuis les variables d'environnement standard du SDK
   * (`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_INSTANCE_NAME` ou
   * `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_DEPLOYMENT_NAME`,
   * `AZURE_OPENAI_API_VERSION`).
   */
  modelProvider?: LogisticsModelProvider;
  /** Nom du modèle LLM à invoquer (par exemple "gpt-5", "gpt-4o", etc.). */
  modelName?: string;
  /** Prompt système régissant le comportement, la langue et les contraintes anti-hallucination. */
  systemPrompt?: string;
  /** Limite maximale d'appels au modèle par interaction (middleware LangChain). */
  maxModelCalls?: number;
  /** Limite maximale d'appels d'outils par interaction (middleware LangChain). */
  maxToolCalls?: number;
}

function createDefaultModel(
  provider: LogisticsModelProvider,
  modelName: string,
): BaseChatModel {
  // Pas de `temperature` explicite : les modèles de raisonnement (familles
  // GPT-5 / o-series, sur OpenAI comme sur Azure) rejettent toute valeur non
  // par défaut avec une erreur 400 ("Only the default (1) value is
  // supported"). La consigne "ne jamais halluciner" du prompt système reste
  // la garde-fou réel, pas ce paramètre.
  if (provider === "azure") {
    return new AzureChatOpenAI({ model: modelName });
  }

  return new ChatOpenAI({ model: modelName });
}

/**
 * Crée et configure un ReactAgent LangChain autonome spécialisé dans la gestion logistique.
 *
 * L'agent est équipé des 19 outils logistiques sécurisés, d'un prompt système strict
 * (anti-hallucination, français professionnel, politesse), et de middlewares de limitation
 * des appels (`modelCallLimitMiddleware` et `toolCallLimitMiddleware`).
 *
 * @param options - Options de configuration de l'agent et dépendances (client, base Prisma, LLM).
 * @returns Une instance prête à l'emploi de `ReactAgent` exécutable en streaming via `.streamEvents()`.
 *
 * @example
 * ```typescript
 * const agent = createLogisticsAgent({
 *   customer: { customerId: "c-123", email: "client@example.com" },
 *   prisma: logisticsPrismaClient,
 * });
 *
 * const stream = await agent.streamEvents(
 *   { messages: [{ role: "user", content: "Où est mon colis ?" }] },
 *   { version: "v3" }
 * );
 * ```
 */
export function createLogisticsAgent({
  customer,
  prisma,
  model,
  modelProvider = (process.env.LOGISTICS_MODEL_PROVIDER as
    | LogisticsModelProvider
    | undefined) ?? "openai",
  modelName = process.env.LOGISTICS_MODEL ?? "gpt-5",
  systemPrompt = LOGISTICS_SYSTEM_PROMPT,
  maxModelCalls = 10,
  maxToolCalls = 25,
  extraTools,
}: CreateLogisticsAgentOptions): ReactAgent {
  if (modelProvider !== "openai" && modelProvider !== "azure") {
    throw new Error(
      `Fournisseur de modèle logistique inconnu : "${modelProvider}". Valeurs acceptées : "openai", "azure".`,
    );
  }

  const defaultTools = createLogisticsTools({ customer, prisma });
  const tools = extraTools && extraTools.length > 0 ? [...defaultTools, ...extraTools] : defaultTools;

  return createAgent({
    model: model ?? createDefaultModel(modelProvider, modelName),
    tools,
    systemPrompt,
    middleware: [
      modelCallLimitMiddleware({
        runLimit: maxModelCalls,
        exitBehavior: "end",
      }),
      toolCallLimitMiddleware({
        runLimit: maxToolCalls,
        exitBehavior: "continue",
      }),
    ],
  });
}
