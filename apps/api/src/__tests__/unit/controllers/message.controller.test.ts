import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { MessageController } from "../../../controllers/message.controller.js";
import { ConversationRepository } from "../../../repositories/conversation.repository.js";
import { JobService } from "../../../services/job.service.js";
import { SseService } from "../../../services/sse.service.js";

function createMockResponse() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  return res;
}

describe("MessageController Unit Tests", () => {
  const originalCreateJob = JobService.createJob;
  const originalFindByUserId = ConversationRepository.findByUserId;
  const originalFindById = ConversationRepository.findById;
  const originalSoftDelete = ConversationRepository.softDelete;
  const originalSetupSession = SseService.setupSession;
  const originalRegisterSession = SseService.registerSession;

  beforeEach(() => {
    JobService.createJob = originalCreateJob;
    ConversationRepository.findByUserId = originalFindByUserId;
    ConversationRepository.findById = originalFindById;
    ConversationRepository.softDelete = originalSoftDelete;
    SseService.setupSession = originalSetupSession;
    SseService.registerSession = originalRegisterSession;
  });

  describe("createMessage", () => {
    it("devrait retourner 400 si le prompt est absent", async () => {
      const req: any = { body: {}, user: { id: "u-1" } };
      const res = createMockResponse();

      await MessageController.createMessage(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: "Prompt requis" });
    });

    it("devrait créer le job et retourner 201 avec les métadonnées", async () => {
      JobService.createJob = async (userId, prompt, convId, model) => {
        return {
          job_id: "job-123",
          conversation_id: convId || "conv-999",
          stream_url: "http://localhost/sse/job-123",
        };
      };

      const req: any = {
        body: { prompt: "Bonjour IA", conversation_id: "conv-1", model: "CHATBOT" },
        user: { id: "u-1" },
      };
      const res = createMockResponse();

      await MessageController.createMessage(req, res);

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.job_id, "job-123");
      assert.strictEqual(res.body.conversation_id, "conv-1");
    });
  });

  describe("getConversations", () => {
    it("devrait retourner 200 avec la liste des conversations de l'utilisateur", async () => {
      const mockConvs = [{ id: "c-1", title: "Discussion 1" }, { id: "c-2", title: "Discussion 2" }];
      ConversationRepository.findByUserId = async (userId: string) => mockConvs as any;

      const req: any = { user: { id: "u-1" } };
      const res = createMockResponse();

      await MessageController.getConversations(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, mockConvs);
    });
  });

  describe("getConversation", () => {
    it("devrait retourner 404 si la conversation est introuvable", async () => {
      ConversationRepository.findById = async () => null as any;

      const req: any = { params: { id: "unknown-conv" }, user: { id: "u-1" } };
      const res = createMockResponse();

      await MessageController.getConversation(req, res);

      assert.strictEqual(res.statusCode, 404);
      assert.deepStrictEqual(res.body, { error: "Conversation non trouvée" });
    });

    it("devrait retourner 200 avec le contenu de la conversation si elle existe", async () => {
      const mockConv = { id: "c-1", title: "Titre", messages: [] };
      ConversationRepository.findById = async (id: string) => mockConv as any;

      const req: any = { params: { id: "c-1" }, user: { id: "u-1" } };
      const res = createMockResponse();

      await MessageController.getConversation(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, mockConv);
    });
  });

  describe("deleteConversation", () => {
    it("devrait effectuer la suppression logique et retourner 200", async () => {
      let softDeletedId = "";
      ConversationRepository.softDelete = async (id: string) => {
        softDeletedId = id;
        return {} as any;
      };

      const req: any = { params: { id: "conv-to-delete" }, user: { id: "u-1" } };
      const res = createMockResponse();

      await MessageController.deleteConversation(req, res);

      assert.strictEqual(softDeletedId, "conv-to-delete");
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { message: "Conversation supprimée" });
    });
  });

  describe("streamJobEvents", () => {
    it("devrait initialiser et enregistrer la session SSE", async () => {
      const mockSession = { id: "sse-sess" };
      let registeredKey = "";
      let registeredSession: any = null;

      SseService.setupSession = async (req: any, res: any, jobId?: string) => mockSession as any;
      SseService.registerSession = (key: string, session: any) => {
        registeredKey = key;
        registeredSession = session;
      };

      const req: any = { params: { jobId: "job-sse-1" } };
      const res: any = {};

      await MessageController.streamJobEvents(req, res);

      assert.strictEqual(registeredKey, "job-sse-1");
      assert.strictEqual(registeredSession, mockSession);
    });
  });
});
