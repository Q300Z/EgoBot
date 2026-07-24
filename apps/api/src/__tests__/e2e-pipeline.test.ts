import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { EventSource } from "eventsource";
(globalThis as any).EventSource = EventSource;
(global as any).EventSource = EventSource;

import { app } from "../app.js";
import { LogibotClientSDK } from "@egobot/sdk/client";
import { WorkerApplication } from "@egobot/sdk/worker";
import { SseService } from "../services/sse.service.js";
import { JobService } from "../services/job.service.js";
import { TacheService } from "../services/tache.service.js";
import { valkeyStream, valkeyReader, valkeyWriter } from "../config/valkey.js";
import { prisma } from "../config/db.js";
import type { Server } from "http";

describe("E2E Reactive Stack: SDK <-> API <-> Valkey <-> Worker", () => {
  let server: Server;
  let baseUrl: string;
  let sdk: LogibotClientSDK;
  let worker: WorkerApplication;

  before(async () => {
    SseService.init();
    JobService.init();
    TacheService.init();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 8000;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    sdk = new LogibotClientSDK({ baseUrl });

    worker = new WorkerApplication({
      workerId: "e2e-ts-worker",
      models: ["CHATBOT"],
      env: "test",
      redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    });

    worker.registerTask("CHATBOT", async (payload: any, ctx: any) => {
      const tokens = ["Bonjour", " du", " Worker", " E2E", " !"];
      for (const token of tokens) {
        if (await ctx.checkCancellation()) return;
        await ctx.sendToken(token);
        await new Promise((r) => setTimeout(r, 60));
      }
    });

    worker.start();
  });

  after(async () => {
    JobService.stop();
    TacheService.stop();
    if (worker) worker.stop();
    if (server) server.close();
    await Promise.all([
      valkeyStream.quit(),
      valkeyReader.quit(),
      valkeyWriter.quit(),
      prisma.$disconnect(),
    ]);
  });

  test("Flux E2E Réactif : Inscription -> Login -> Message -> Valkey Stream -> Worker -> SSE -> SDK", async () => {
    const testEmail = `e2e-${Date.now()}@egobot.ai`;
    const testPassword = "Password123!";

    // Étape 1 : Inscription utilisateur via le SDK Client
    const registerRes = await sdk.register(testEmail, testPassword, "USER");
    assert.ok(registerRes.token, "Le token JWT doit être renvoyé à l'inscription");
    assert.strictEqual(registerRes.user.email, testEmail);

    // Étape 2 : Connexion via le SDK Client
    const loginRes = await sdk.login(testEmail, testPassword);
    assert.ok(loginRes.token, "Le token JWT doit être renvoyé à la connexion");

    // Étape 3 : Récupération du profil via SDK -> API /api/v1/auth/me
    const me = await sdk.getMe();
    assert.strictEqual(me.email, testEmail);

    // Étape 4 : Envoi d'un prompt / Création de Job via SDK -> API -> Valkey
    const prompt = "Test d'inférence E2E réactive SDK -> API -> Valkey -> Worker";
    const jobRes = await sdk.createMessage(prompt, undefined, "CHATBOT");
    assert.ok(jobRes.job_id, "Le job_id doit être généré");
    assert.ok(jobRes.conversation_id, "Le conversation_id doit être généré");

    // Étape 5 : Streaming réactif SSE : SDK écoute la réponse temps réel du Worker via Valkey + API
    const receivedTokens: string[] = [];
    let finalStatus = "";

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout du flux réactif E2E (15s)"));
      }, 15000);

      const cleanup = sdk.connectJobStream(jobRes.job_id, {
        onToken: (chunk: string) => {
          receivedTokens.push(chunk);
        },
        onStatus: (status: string) => {
          if (status === "completed" || status === "failed") {
            finalStatus = status;
            clearTimeout(timeout);
            cleanup();
            resolve();
          }
        },
        onError: (err: any) => {
          clearTimeout(timeout);
          cleanup();
          reject(err);
        },
      });
    });

    // Étape 6 : Assertions sur les données transitées à travers toute la stack réactive
    assert.strictEqual(finalStatus, "completed");
    assert.strictEqual(receivedTokens.join(""), "Bonjour du Worker E2E !");

    // Étape 7 : Validation de la persistance en base de données Prisma via le SDK
    const conversation = await sdk.getConversation(jobRes.conversation_id);
    assert.ok(conversation.messages.length >= 2, "La conversation doit contenir le prompt et la réponse");
    assert.strictEqual(conversation.messages[0].content, prompt);
  });
});
