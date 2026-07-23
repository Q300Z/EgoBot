import { valkeyStream, valkeyWriter } from "../config/valkey.js";
import { eventBus } from "../events/eventBus.js";
import { JobRepository } from "../repositories/job.repository.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import { LoggerFactory } from "../config/logger.js";
import { v4 as uuidv4 } from "uuid";

const logger = LoggerFactory.getLogger("JobService");

export class JobService {
  static init() {
    this.pollSseStreams();
    logger.info("JobService initialisé (Polling Valkey Streams SSE).");
  }

  static async createJob(userId: string, prompt: string, conversationId?: string, model: string = "CHATBOT") {
    let convId: string = conversationId || "";
    if (!convId) {
      const title = prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt;
      const conv = await ConversationRepository.create({ user_id: userId, title, model });
      convId = conv.id;
    }

    const userMsg = await ConversationRepository.addMessage({ conversation_id: convId, role: "USER", content: prompt });
    const assistantMsg = await ConversationRepository.addMessage({ conversation_id: convId, role: "ASSISTANT", content: "" });

    const jobId = uuidv4();
    await JobRepository.create({
      id: jobId,
      conversation_id: convId,
      user_prompt_id: userMsg.id,
      assistant_message_id: assistantMsg.id,
      model,
    });

    const queueKey = `jobs:queue:dev:${model}`;
    const payload = {
      jobId,
      conversationId: convId,
      prompt,
      model,
    };

    await valkeyWriter.xadd(queueKey, "*", "data", JSON.stringify(payload));
    logger.info(`Job ${jobId} enfilé dans ${queueKey}`);

    return {
      job_id: jobId,
      conversation_id: convId,
      stream_url: `http://localhost:8000/sse/v1/job/${jobId}`,
    };
  }

  private static async pollSseStreams() {
    while (true) {
      try {
        const keys = await valkeyStream.keys("jobs:sse:dev:*");
        for (const key of keys) {
          const parts = key.split(":");
          const jobId = parts[parts.length - 1];

          const events = await valkeyStream.xrange(key, "-", "+");
          let fullContent = "";
          let isCompleted = false;
          let completedData: any = null;

          for (const [eventId, fields] of events) {
            let eventName = "token";
            let eventData = "";

            for (let i = 0; i < fields.length; i += 2) {
              if (fields[i] === "event") eventName = fields[i + 1];
              if (fields[i] === "data") eventData = fields[i + 1];
            }

            if (eventData) {
              const parsed = JSON.parse(eventData);

              // Standardisation du Format DTO SSE Réactif { type, payload, timestamp }
              const normalizedPayload = {
                type: eventName,
                payload: parsed.data || parsed,
                timestamp: new Date().toISOString(),
              };

              eventBus.publish("job.token_emitted", { jobId, eventId, envelope: normalizedPayload });

              if ((eventName === "token" || parsed.data?.kind === "token") && (parsed.data?.chunk || parsed.chunk)) {
                fullContent += parsed.data?.chunk || parsed.chunk;
              }

              if (parsed.data?.status === "COMPLETED" || parsed.status === "COMPLETED") {
                isCompleted = true;
                completedData = parsed.data || parsed;
              }
            }
          }

          if (isCompleted) {
            const job = await JobRepository.findById(jobId);
            if (job) {
              const finalContent = completedData?.full_content || fullContent;
              if (finalContent) {
                await ConversationRepository.updateMessageContent(job.assistant_message_id, finalContent);
              }
              await JobRepository.update(jobId, {
                status: "COMPLETED",
                ended_at: new Date(),
                generated_tokens: completedData?.statistics?.generated_tokens,
                tokens_per_second: completedData?.statistics?.tokens_per_second,
                time_to_first_token: completedData?.statistics?.time_to_first_token,
              });
            }
            await valkeyWriter.del(key);
          }
        }
      } catch (err) {
        logger.error("Erreur polling SSE Stream Valkey", err);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  static async handleStuckJobsVerifier() {
    const limitDate = new Date(Date.now() - 15 * 60 * 1000);
    const stuck = await JobRepository.findStuckJobs(limitDate);
    for (const job of stuck) {
      await JobRepository.update(job.id, {
        status: "FAILED",
        error: "Job bloqué (inactivité).",
        ended_at: new Date(),
      });
      logger.warn(`Job bloqué ${job.id} passé à FAILED.`);
    }
  }
}
