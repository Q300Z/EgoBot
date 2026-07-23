import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import EventEmitter from "node:events";
import { JobService } from "../../../services/job.service.js";
import { SseService } from "../../../services/sse.service.js";
import { TacheService } from "../../../services/tache.service.js";
import { ConversationRepository } from "../../../repositories/conversation.repository.js";
import { JobRepository } from "../../../repositories/job.repository.js";
import { valkeyWriter, valkeyStream } from "../../../config/valkey.js";
import { eventBus } from "../../../events/eventBus.js";

describe("Services Unit Tests", () => {
  describe("JobService", () => {
    const originalCreateConv = ConversationRepository.create;
    const originalAddMessage = ConversationRepository.addMessage;
    const originalCreateJobRepo = JobRepository.create;
    const originalXadd = valkeyWriter.xadd;

    beforeEach(() => {
      ConversationRepository.create = originalCreateConv;
      ConversationRepository.addMessage = originalAddMessage;
      JobRepository.create = originalCreateJobRepo;
      valkeyWriter.xadd = originalXadd;
    });

    it("createJob devrait générer un nouveau job et créer la conversation si nécessaire", async () => {
      let createdConvTitle = "";
      ConversationRepository.create = async (data: any) => {
        createdConvTitle = data.title;
        return { id: "conv-auto-gen" } as any;
      };

      let addedMessages: any[] = [];
      ConversationRepository.addMessage = async (data: any) => {
        addedMessages.push(data);
        return { id: `msg-${addedMessages.length}` } as any;
      };

      let createdJobData: any = null;
      JobRepository.create = async (data: any) => {
        createdJobData = data;
        return data as any;
      };

      let xaddArgs: any[] = [];
      valkeyWriter.xadd = async (...args: any[]) => {
        xaddArgs = args;
        return "1-0" as any;
      };

      const result = await JobService.createJob("user-1", "Combien font 2+2 ?");

      assert.strictEqual(createdConvTitle, "Combien font 2+2 ?");
      assert.strictEqual(addedMessages.length, 2);
      assert.strictEqual(addedMessages[0].role, "USER");
      assert.strictEqual(addedMessages[1].role, "ASSISTANT");
      assert.ok(createdJobData.id);
      assert.strictEqual(createdJobData.model, "CHATBOT");
      assert.strictEqual(xaddArgs[0], "jobs:queue:dev:CHATBOT");
      assert.strictEqual(result.conversation_id, "conv-auto-gen");
    });

    it("handleStuckJobsVerifier devrait passer les jobs en souffrance à FAILED", async () => {
      const originalFindStuck = JobRepository.findStuckJobs;
      const originalUpdate = JobRepository.update;

      const stuckList = [{ id: "job-stuck-1" }, { id: "job-stuck-2" }];
      const updatedJobs: any[] = [];

      JobRepository.findStuckJobs = async () => stuckList as any;
      JobRepository.update = async (id: string, data: any) => {
        updatedJobs.push({ id, data });
        return data as any;
      };

      await JobService.handleStuckJobsVerifier();

      assert.strictEqual(updatedJobs.length, 2);
      assert.strictEqual(updatedJobs[0].data.status, "FAILED");
      assert.strictEqual(updatedJobs[0].data.error, "Job bloqué (inactivité).");

      JobRepository.findStuckJobs = originalFindStuck;
      JobRepository.update = originalUpdate;
    });

    it("init et stop de JobService ne doivent pas planter", () => {
      JobService.init();
      JobService.stop();
    });
  });

  describe("SseService", () => {
    it("registerSession devrait ajouter la session et gérer la déconnexion", () => {
      const mockSession = new EventEmitter() as any;
      mockSession.push = () => {};

      SseService.registerSession("job-sse-test", mockSession);

      // Publier un événement pour vérifier l'écoute
      eventBus.publish("job.token_emitted", {
        jobId: "job-sse-test",
        envelope: {
          event: "token",
          data: { chunk: "Hello" },
        },
      });

      // Déclencher déconnexion
      mockSession.emit("disconnected");
    });

    it("setupSession avec last-event-id devrait tenter le replay des événements", async () => {
      const originalXrange = valkeyStream.xrange;

      valkeyStream.xrange = async () => [
        ["100-1", ["event", "token", "data", JSON.stringify({ chunk: "Replayed token" })]],
      ] as any;

      const req: any = {
        headers: { "last-event-id": "100-0" },
        query: {},
      };
      const res: any = {
        writeHead: () => {},
        flushHeaders: () => {},
        write: () => {},
      };

      const session = await SseService.setupSession(req, res, "job-replay-1");
      assert.ok(session);

      valkeyStream.xrange = originalXrange;
    });

    it("init de SseService devrait abonner la diffusion SSE", () => {
      SseService.init();
    });
  });

  describe("TacheService", () => {
    it("init et stop de TacheService doivent démarrer et arrêter la tâche cron sans erreur", () => {
      TacheService.init();
      TacheService.stop();
    });
  });
});
