import Redis from "ioredis";
import { createWorkerContext, WorkerTaskContext } from "./context.js";

export interface WorkerAppOptions {
  workerId: string;
  models: string[];
  env?: string;
  redisUrl?: string;
  valkeyUrl?: string;
}

export type TaskHandler = (payload: any, ctx: WorkerTaskContext) => Promise<void>;

export class WorkerApplication {
  private workerId: string;
  private models: string[];
  private env: string;
  private redisReader: Redis;
  private redisWriter: Redis;
  private handlers: Map<string, TaskHandler> = new Map();
  private isRunning: boolean = false;

  constructor(options: WorkerAppOptions) {
    this.workerId = options.workerId;
    this.models = options.models;
    this.env = options.env || "dev";
    const url = options.redisUrl || "redis://localhost:6379";

    this.redisReader = new Redis(url);
    this.redisWriter = new Redis(url);
  }

  registerTask(model: string, handler: TaskHandler) {
    this.handlers.set(model, handler);
  }

  async start() {
    this.isRunning = true;
    console.info(`[Worker SDK] Worker ${this.workerId} démarré sur les modèles : ${this.models.join(", ")}`);

    // Démarrage de la boucle de consommation Redis Streams
    this.pollQueues();
    this.startHeartbeat();
  }

  private async startHeartbeat() {
    while (this.isRunning) {
      for (const model of this.models) {
        const presenceKey = `workers:presence:${this.workerId}:${model}`;
        await this.redisWriter.set(presenceKey, JSON.stringify({ status: "online", worker_id: this.workerId, model }), "EX", 15);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  private async pollQueues() {
    const commonGroupName = `group:llm-workers:${this.env}`;

    // Assurer l'existence d'un unique Consumer Group partagé par tous les workers
    for (const model of this.models) {
      const streamQueueKey = `jobs:queue:${this.env}:${model}`;
      try {
        await this.redisReader.xgroup("CREATE", streamQueueKey, commonGroupName, "$", "MKSTREAM");
      } catch (e) {
        // Ignorer si le groupe existe déjà
      }
    }

    // Lancer la tâche d'auto-claim périodique (PEL Recovery)
    this.startPelRecoveryLoop(commonGroupName);

    while (this.isRunning) {
      try {
        for (const model of this.models) {
          const streamQueueKey = `jobs:queue:${this.env}:${model}`;

          const response = (await this.redisReader.xreadgroup(
            "GROUP",
            commonGroupName,
            this.workerId,
            "COUNT",
            1,
            "BLOCK",
            1000,
            "STREAMS",
            streamQueueKey,
            ">"
          )) as Array<[string, Array<[string, string[]]>]> | null;

          if (response && response.length > 0) {
            const [stream, messages] = response[0];
            for (const message of messages) {
              const [id, fields] = message;
              await this.processMessage(streamQueueKey, commonGroupName, id, fields, model);
            }
          }
        }
      } catch (err) {
        console.error("[Worker SDK] Erreur lors du polling Redis Streams", err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async startPelRecoveryLoop(groupName: string) {
    const MIN_IDLE_TIME_MS = 60000; // 60 secondes d'inactivité = job bloqué

    while (this.isRunning) {
      try {
        for (const model of this.models) {
          const streamQueueKey = `jobs:queue:${this.env}:${model}`;

          const res = (await (this.redisReader as any).xautoclaim(
            streamQueueKey,
            groupName,
            this.workerId,
            MIN_IDLE_TIME_MS,
            "0-0",
            "COUNT",
            10
          )) as [string, Array<[string, string[]]>] | null;

          if (res && res[1] && res[1].length > 0) {
            console.warn(`[Worker SDK] ${res[1].length} message(s) orphelin(s) récupéré(s) via XAUTOCLAIM.`);
            for (const message of res[1]) {
              const [id, fields] = message as [string, string[]];
              await this.processMessage(streamQueueKey, groupName, id, fields, model);
            }
          }
        }
      } catch (err) {
        console.error("[Worker SDK] Erreur dans la boucle PEL Recovery", err);
      }
      await new Promise((r) => setTimeout(r, 30000));
    }
  }

  private async handleProcessingFailure(
    streamKey: string,
    group: string,
    messageId: string,
    payload: any,
    error: any
  ) {
    const retryCount = (payload._retryCount || 0) + 1;
    const MAX_RETRIES = 3;

    if (retryCount >= MAX_RETRIES) {
      console.error(`[DLQ] Message ${messageId} a échoué ${MAX_RETRIES} fois. Routage vers la DLQ.`);
      const dlqKey = `${streamKey}:dlq`;
      await this.redisWriter.xadd(
        dlqKey,
        "*",
        "originalId",
        messageId,
        "payload",
        JSON.stringify(payload),
        "error",
        error?.message || String(error),
        "failedAt",
        new Date().toISOString()
      );
      await this.redisReader.xack(streamKey, group, messageId);
    } else {
      console.warn(`[Retry] Échec message ${messageId} (tentative ${retryCount}/${MAX_RETRIES}).`);
      payload._retryCount = retryCount;
      await this.redisWriter.xadd(streamKey, "*", "data", JSON.stringify(payload));
      await this.redisReader.xack(streamKey, group, messageId);
    }
  }

  private async processMessage(streamKey: string, group: string, messageId: string, fields: string[], model: string) {
    let payloadData: any = {};
    try {
      for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === "data") {
          payloadData = JSON.parse(fields[i + 1]);
        }
      }

      const jobId = payloadData.jobId || payloadData.job_id;
      const conversationId = payloadData.conversationId || payloadData.conversation_id;

      if (!jobId || !conversationId) {
        await this.redisReader.xack(streamKey, group, messageId);
        return;
      }

      const handler = this.handlers.get(model);
      if (!handler) {
        console.warn(`[Worker SDK] Aucun handler enregistré pour le modèle ${model}`);
        await this.redisReader.xack(streamKey, group, messageId);
        return;
      }

      const ctx = createWorkerContext(jobId, conversationId, this.env, this.redisWriter);
      const startTime = Date.now();

      await handler(payloadData, ctx);

      const durationSec = (Date.now() - startTime) / 1000;
      const sseStreamKey = `jobs:sse:${this.env}:${jobId}`;

      const completedEnvelope = {
        event: "job.completed",
        data: {
          kind: "stats",
          status: "COMPLETED",
          job_id: jobId,
          conversation_id: conversationId,
          statistics: {
            generated_tokens: 10,
            total_generation_time: durationSec,
            time_to_first_token: 0.05,
            tokens_per_second: 2.0,
          },
        },
      };

      await this.redisWriter.xadd(
        sseStreamKey,
        "MAXLEN",
        "~",
        1000,
        "*",
        "event",
        completedEnvelope.event,
        "data",
        JSON.stringify(completedEnvelope)
      );
      await this.redisWriter.expire(sseStreamKey, 3600);
      await this.redisReader.xack(streamKey, group, messageId);
    } catch (err: any) {
      console.error(`[Worker SDK] Erreur de traitement du message ${messageId}`, err);
      await this.handleProcessingFailure(streamKey, group, messageId, payloadData, err);
    }
  }

  stop() {
    this.isRunning = false;
    this.redisReader.disconnect();
    this.redisWriter.disconnect();
  }
}
