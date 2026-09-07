import { WorkerApplication } from "@egobot/sdk/worker";
import dotenv from "dotenv";

dotenv.config();

const worker = new WorkerApplication({
  workerId: "ts-worker-1",
  models: ["CHATBOT", "ANALYTICS"],
  env: process.env.NODE_ENV || "dev",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
});

worker.registerTask("CHATBOT", async (payload, ctx) => {
  const prompt = payload.prompt || payload.data?.prompt || "";
  console.log(`[Worker TS] Prompt reçu pour le job ${ctx.jobId} : "${prompt}"`);

  const firstPart = [
    "Bonjour",
    " !",
    " Je",
    " suis",
    " un",
    " worker",
    " d'inférence",
    " basé",
    " sur",
    " la",
    " documentation",
    " officielle",
    " ",
  ];

  for (const word of firstPart) {
    if (await ctx.checkCancellation()) {
      console.warn(`[Worker TS] Annulation du job ${ctx.jobId} détectée !`);
      return;
    }
    await ctx.sendToken(word);
    await new Promise((r) => setTimeout(r, 120));
  }

  // Émission d'une source de données au milieu de la réponse
  await ctx.sendSource({
    title: "Manuel Logistique v2",
    url: "https://example.com/doc",
    type: "doc",
  });

  const secondPart = [
    " ",
    "pour",
    " répondre",
    " précisément",
    " à",
    " votre",
    " demande",
    ".",
  ];

  for (const word of secondPart) {
    if (await ctx.checkCancellation()) {
      console.warn(`[Worker TS] Annulation du job ${ctx.jobId} détectée !`);
      return;
    }
    await ctx.sendToken(word);
    await new Promise((r) => setTimeout(r, 120));
  }
});

worker.start();

const gracefulShutdownWorker = (signal: string) => {
  console.info(`[Worker TS] Signal ${signal} reçu. Fermeture du worker...`);
  worker.stop();
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdownWorker("SIGTERM"));
process.on("SIGINT", () => gracefulShutdownWorker("SIGINT"));
