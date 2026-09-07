import { createPrismaClient, type LogisticsPrismaClient } from "@egobot/logistics-agent/database";
import { WorkerApplication } from "@egobot/sdk/worker";
import dotenv from "dotenv";
import { createLogisticsHandler } from "./handlers/logistics.handler.js";

dotenv.config();

const worker = new WorkerApplication({
  workerId: "ts-worker-1",
  models: ["CHATBOT", "ANALYTICS", "LOGISTICS"],
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

let logisticsPrisma: LogisticsPrismaClient | undefined;

function getLogisticsPrisma(): LogisticsPrismaClient {
  if (!logisticsPrisma) {
    logisticsPrisma = createPrismaClient(process.env.DATABASE_URL);
  }
  return logisticsPrisma;
}

worker.registerTask("LOGISTICS", createLogisticsHandler({ getPrisma: getLogisticsPrisma }));

worker.start();

const gracefulShutdownWorker = (signal: string) => {
  console.info(`[Worker TS] Signal ${signal} reçu. Fermeture du worker...`);
  worker.stop();
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdownWorker("SIGTERM"));
process.on("SIGINT", () => gracefulShutdownWorker("SIGINT"));
