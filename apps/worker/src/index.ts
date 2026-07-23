import { WorkerApplication } from "@my-llm/sdk/worker";
import dotenv from "dotenv";

dotenv.config();

const worker = new WorkerApplication({
  workerId: "ts-worker-1",
  models: ["CHATBOT", "ANALYTICS"],
  env: process.env.NODE_ENV || "dev",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
});

worker.registerTask("CHATBOT", async (payload, ctx) => {
  console.log(`[Worker TS] Prompt reçu pour le job ${ctx.jobId} : "${payload.prompt}"`);

  const words = [
    "Bonjour",
    " !",
    " Je",
    " suis",
    " un",
    " worker",
    " d'inférence",
    " écrit",
    " en",
    " Pure",
    " TypeScript",
    " !",
  ];

  for (const word of words) {
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
