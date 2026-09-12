import { describe, expect, it, vi } from "vitest";
import { tool } from "langchain";
import { z } from "zod";
import { ToolMessage } from "@langchain/core/messages";
import { wrapTools } from "./tool-wrapper.js";

describe("wrapTools", () => {
  it("exécute l'outil avec succès lorsque tout se passe bien", async () => {
    const dummyTool = tool(
      async ({ query }) => ({ result: `echo:${query}` }),
      {
        name: "test_tool",
        description: "Test tool description",
        schema: z.object({ query: z.string() }),
      }
    );

    const [wrapped] = wrapTools([dummyTool]);
    const res = await wrapped.invoke({ query: "bonjour" });

    expect(res).toEqual({ result: "echo:bonjour" });
  });

  it("applique le rate limit et renvoie une chaîne JSON sans toolCallId", async () => {
    const dummyTool = tool(
      async () => ({ ok: true }),
      {
        name: "limited_tool",
        description: "Limited tool",
        schema: z.object({}),
      }
    );

    const [wrapped] = wrapTools([dummyTool], {
      limited_tool: { maxCalls: 2 },
    });

    await wrapped.invoke({});
    await wrapped.invoke({});
    const thirdCall = await wrapped.invoke({});

    expect(typeof thirdCall).toBe("string");
    const parsed = JSON.parse(thirdCall as string);
    expect(parsed.code).toBe("RATE_LIMITED");
    expect(parsed.found).toBe(false);
  });

  it("renvoie un ToolMessage valide avec status error lorsque rate-limited et toolCallId présent", async () => {
    const dummyTool = tool(
      async () => ({ ok: true }),
      {
        name: "limited_tool_with_id",
        description: "Limited tool with id",
        schema: z.object({}),
      }
    );

    const [wrapped] = wrapTools([dummyTool], {
      limited_tool_with_id: { maxCalls: 1 },
    });

    await wrapped.invoke({ id: "call_abc123" });
    const secondCall = (await wrapped.invoke({ id: "call_abc123" })) as unknown as ToolMessage;

    expect(secondCall).toBeInstanceOf(ToolMessage);
    expect(secondCall.tool_call_id).toBe("call_abc123");
    expect(secondCall.status).toBe("error");
    const content = JSON.parse(secondCall.content as string);
    expect(content.code).toBe("RATE_LIMITED");
  });

  it("gère les erreurs avec ToolMessage si toolCallId présent", async () => {
    const errorTool = tool(
      async () => {
        throw new Error("Simulated failure");
      },
      {
        name: "failing_tool",
        description: "Failing tool",
        schema: z.object({}),
      }
    );

    const [wrapped] = wrapTools([errorTool]);
    const res = (await wrapped.invoke({ id: "call_err_123" })) as unknown as ToolMessage;

    expect(res).toBeInstanceOf(ToolMessage);
    expect(res.tool_call_id).toBe("call_err_123");
    expect(res.status).toBe("error");
    const content = JSON.parse(res.content as string);
    expect(content.code).toBe("TOOL_ERROR");
    expect(content.message).toContain("Simulated failure");
  });

  it("propage l'erreur si aucun toolCallId n'est présent", async () => {
    const errorTool = tool(
      async () => {
        throw new Error("Simulated failure");
      },
      {
        name: "failing_tool_no_id",
        description: "Failing tool without id",
        schema: z.object({}),
      }
    );

    const [wrapped] = wrapTools([errorTool]);
    await expect(wrapped.invoke({})).rejects.toThrow("Simulated failure");
  });

  it("lève une erreur de timeout si l'exécution dépasse le délai", async () => {
    const slowTool = tool(
      async () => {
        await new Promise((r) => setTimeout(r, 100));
        return { ok: true };
      },
      {
        name: "slow_tool",
        description: "Slow tool",
        schema: z.object({}),
      }
    );

    const [wrapped] = wrapTools([slowTool], {
      slow_tool: { timeoutMs: 20 },
    });

    await expect(wrapped.invoke({})).rejects.toThrow(/Timeout: slow_tool a dépassé 20ms/);
  });
});
