import { describe, it } from "node:test";
import assert from "node:assert";
import { WorkerApplication } from "@egobot/sdk/worker";

describe("Worker App & Logic Unit Tests", () => {
  it("devrait pouvoir instancier WorkerApplication et enregistrer une tâche", async () => {
    const worker = new WorkerApplication({
      workerId: "unit-test-worker",
      models: ["CHATBOT", "ANALYTICS"],
      env: "test",
      redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    });

    let handlerExecuted = false;
    const streamedTokens: string[] = [];

    worker.registerTask("CHATBOT", async (payload: any, ctx: any) => {
      handlerExecuted = true;
      const tokens = ["Bonjour", " Test", " Worker"];
      for (const token of tokens) {
        if (await ctx.checkCancellation()) return;
        await ctx.sendToken(token);
        streamedTokens.push(token);
      }
    });

    // Simuler l'exécution du context mocké
    const mockContext = {
      jobId: "job-unit-1",
      checkCancellation: async () => false,
      sendToken: async (token: string) => {},
    };

    const handler = (worker as any).handlers?.get("CHATBOT");
    assert.ok(handler, "Le handler CHATBOT doit être enregistré");

    await handler({ prompt: "Mon prompt test" }, mockContext);

    assert.strictEqual(handlerExecuted, true);
    assert.deepStrictEqual(streamedTokens, ["Bonjour", " Test", " Worker"]);
    worker.stop();
  });

  it("devrait respecter le signal d'annulation s'il est détecté", async () => {
    const worker = new WorkerApplication({
      workerId: "cancellation-worker",
      models: ["CHATBOT"],
      env: "test",
      redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    });

    const streamedTokens: string[] = [];

    worker.registerTask("CHATBOT", async (payload: any, ctx: any) => {
      const tokens = ["Word1", "Word2", "Word3"];
      for (const token of tokens) {
        if (await ctx.checkCancellation()) {
          return;
        }
        await ctx.sendToken(token);
        streamedTokens.push(token);
      }
    });

    let checkCount = 0;
    const mockContext = {
      jobId: "job-canceled-1",
      checkCancellation: async () => {
        checkCount++;
        return checkCount > 1; // Annulé après le premier token
      },
      sendToken: async (token: string) => {},
    };

    const handler = (worker as any).handlers?.get("CHATBOT");
    await handler({ prompt: "Prompt test" }, mockContext);

    assert.strictEqual(streamedTokens.length, 1);
    assert.strictEqual(streamedTokens[0], "Word1");
    worker.stop();
  });
});
