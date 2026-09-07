import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
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

export interface CreateLogisticsAgentOptions {
  customer: AuthenticatedCustomer;
  prisma: LogisticsPrismaClient;
  /**
   * Modèle de chat LangChain à utiliser (ChatOpenAI, AzureChatOpenAI, etc.).
   * Si omis, le modèle par défaut est construit selon `modelProvider`.
   */
  model?: BaseChatModel;
  /**
   * Fournisseur du modèle par défaut lorsque `model` n'est pas fourni.
   * Lu depuis `LOGISTICS_MODEL_PROVIDER` ("openai" ou "azure").
   * La configuration Azure (clé, instance, déploiement, version d'API) est
   * lue depuis les variables d'environnement standard du SDK
   * (`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_INSTANCE_NAME`,
   * `AZURE_OPENAI_API_DEPLOYMENT_NAME`, `AZURE_OPENAI_API_VERSION`).
   */
  modelProvider?: LogisticsModelProvider;
  modelName?: string;
  systemPrompt?: string;
  maxModelCalls?: number;
  maxToolCalls?: number;
}

function createDefaultModel(
  provider: LogisticsModelProvider,
  modelName: string,
): BaseChatModel {
  if (provider === "azure") {
    return new AzureChatOpenAI({ model: modelName, temperature: 0 });
  }

  return new ChatOpenAI({ model: modelName, temperature: 0 });
}

export function createLogisticsAgent({
  customer,
  prisma,
  model,
  modelProvider = (process.env.LOGISTICS_MODEL_PROVIDER as
    | LogisticsModelProvider
    | undefined) ?? "openai",
  modelName = process.env.LOGISTICS_MODEL ?? "gpt-5",
  systemPrompt = LOGISTICS_SYSTEM_PROMPT,
  maxModelCalls = 6,
  maxToolCalls = 8,
}: CreateLogisticsAgentOptions): ReactAgent {
  if (modelProvider !== "openai" && modelProvider !== "azure") {
    throw new Error(
      `Fournisseur de modèle logistique inconnu : "${modelProvider}". Valeurs acceptées : "openai", "azure".`,
    );
  }

  const tools = createLogisticsTools({ customer, prisma });

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
