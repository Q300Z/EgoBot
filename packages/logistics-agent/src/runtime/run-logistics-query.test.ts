import { describe, expect, it } from "vitest";
import { extractTokenUsage } from "./run-logistics-query.js";

describe("extractTokenUsage", () => {
  it("additionne les appels LangChain et leurs détails cache/raisonnement", () => {
    expect(
      extractTokenUsage([
        {
          usage_metadata: {
            input_tokens: 100,
            output_tokens: 20,
            total_tokens: 120,
            input_token_details: { cache_read: 40 },
            output_token_details: { reasoning: 8 },
          },
        },
        {
          usage_metadata: {
            input_tokens: 150,
            output_tokens: 30,
            input_token_details: { cache_read: 10 },
            output_token_details: { reasoning: 12 },
          },
        },
      ]),
    ).toEqual({
      inputTokens: 250,
      cachedInputTokens: 50,
      outputTokens: 50,
      reasoningTokens: 20,
      totalTokens: 300,
    });
  });

  it("accepte les anciennes métadonnées OpenAI", () => {
    expect(
      extractTokenUsage([
        {
          response_metadata: {
            tokenUsage: {
              promptTokens: 80,
              completionTokens: 15,
              totalTokens: 95,
            },
          },
        },
      ]),
    ).toEqual({
      inputTokens: 80,
      cachedInputTokens: 0,
      outputTokens: 15,
      reasoningTokens: 0,
      totalTokens: 95,
    });
  });
});
