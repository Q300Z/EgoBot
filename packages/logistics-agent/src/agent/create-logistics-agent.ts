import { ChatOpenAI } from "@langchain/openai";
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

export interface CreateLogisticsAgentOptions {
  customer: AuthenticatedCustomer;
  prisma: LogisticsPrismaClient;
  model?: ChatOpenAI;
  modelName?: string;
  systemPrompt?: string;
  maxModelCalls?: number;
  maxToolCalls?: number;
}

export function createLogisticsAgent({
  customer,
  prisma,
  model,
  modelName = process.env.LOGISTICS_MODEL ?? "gpt-5",
  systemPrompt = LOGISTICS_SYSTEM_PROMPT,
  maxModelCalls = 6,
  maxToolCalls = 8,
}: CreateLogisticsAgentOptions): ReactAgent {
  const tools = createLogisticsTools({ customer, prisma });

  return createAgent({
    model:
      model ??
      new ChatOpenAI({
        model: modelName,
        temperature: 0,
      }),
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
