import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import EventEmitter from "node:events";
import { AdminController } from "../../../controllers/admin.controller.js";
import { UserRepository } from "../../../repositories/user.repository.js";
import { SseService } from "../../../services/sse.service.js";
import { eventBus } from "../../../events/eventBus.js";

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

describe("AdminController Unit Tests", () => {
  const originalFindAll = UserRepository.findAll;
  const originalCreate = UserRepository.create;
  const originalDelete = UserRepository.delete;
  const originalSetupSession = SseService.setupSession;
  const originalRegisterSession = SseService.registerSession;

  beforeEach(() => {
    UserRepository.findAll = originalFindAll;
    UserRepository.create = originalCreate;
    UserRepository.delete = originalDelete;
    SseService.setupSession = originalSetupSession;
    SseService.registerSession = originalRegisterSession;
  });

  describe("getUsers", () => {
    it("devrait retourner 200 avec la liste de tous les utilisateurs", async () => {
      const mockUsers = [{ id: "u-1", email: "user1@test.com", role: "USER" }];
      UserRepository.findAll = async () => mockUsers as any;

      const req: any = {};
      const res = createMockResponse();

      await AdminController.getUsers(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, mockUsers);
    });
  });

  describe("createUser", () => {
    it("devrait retourner 400 si validation mot de passe/email échoue", async () => {
      const req: any = { body: { email: "admin@test.com", password: "123" } };
      const res = createMockResponse();

      await AdminController.createUser(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: "Email et mot de passe de 6 caractères minimum requis" });
    });

    it("devrait créer un utilisateur et retourner 201 avec ses infos", async () => {
      const mockDate = new Date();
      UserRepository.create = async (data: any) => ({
        id: "created-user-id",
        email: data.email,
        password_hash: data.password_hash,
        role: data.role || "ADMIN",
        created_at: mockDate,
        updated_at: mockDate,
      }) as any;

      const req: any = { body: { email: "admin2@test.com", password: "password123", role: "ADMIN" } };
      const res = createMockResponse();

      await AdminController.createUser(req, res);

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.id, "created-user-id");
      assert.strictEqual(res.body.email, "admin2@test.com");
      assert.strictEqual(res.body.role, "ADMIN");
    });
  });

  describe("deleteUser", () => {
    it("devrait supprimer l'utilisateur et retourner 200", async () => {
      let deletedId = "";
      UserRepository.delete = async (id: string) => {
        deletedId = id;
        return {} as any;
      };

      const req: any = { params: { id: "user-to-del" } };
      const res = createMockResponse();

      await AdminController.deleteUser(req, res);

      assert.strictEqual(deletedId, "user-to-del");
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { message: "Utilisateur supprimé" });
    });
  });

  describe("updateUser", () => {
    it("devrait mettre à jour l'utilisateur et générer un mot de passe si resetPassword = true", async () => {
      const mockDate = new Date();
      const originalUpdate = UserRepository.update;
      UserRepository.update = async (id: string, data: any) => ({
        id,
        email: data.email || "old@test.com",
        role: data.role || "USER",
        created_at: mockDate,
        updated_at: mockDate,
      }) as any;

      const req: any = { params: { id: "u-edit" }, body: { email: "new@test.com", resetPassword: true } };
      const res = createMockResponse();

      await AdminController.updateUser(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.email, "new@test.com");
      assert.strictEqual(typeof res.body.generatedPassword, "string");
      assert.strictEqual(res.body.generatedPassword.length, 12);

      UserRepository.update = originalUpdate;
    });
  });

  describe("getConversations et getConversation", () => {
    it("devrait retourner 200 avec la liste des conversations pour l'admin", async () => {
      const { ConversationRepository } = await import("../../../repositories/conversation.repository.js");
      const originalFindAllAdmin = ConversationRepository.findAllAdmin;
      const originalFindByIdAdmin = ConversationRepository.findByIdAdmin;

      const mockConvs = [{ id: "c-1", title: "Conv Test", user: { id: "u-1", email: "user@test.com" } }];
      ConversationRepository.findAllAdmin = async () => mockConvs as any;
      ConversationRepository.findByIdAdmin = async (id: string) => mockConvs[0] as any;

      const reqList: any = { query: { userId: "u-1" } };
      const resList = createMockResponse();
      await AdminController.getConversations(reqList, resList);
      assert.strictEqual(resList.statusCode, 200);
      assert.deepStrictEqual(resList.body, mockConvs);

      const reqSingle: any = { params: { id: "c-1" } };
      const resSingle = createMockResponse();
      await AdminController.getConversation(reqSingle, resSingle);
      assert.strictEqual(resSingle.statusCode, 200);
      assert.deepStrictEqual(resSingle.body, mockConvs[0]);

      ConversationRepository.findAllAdmin = originalFindAllAdmin;
      ConversationRepository.findByIdAdmin = originalFindByIdAdmin;
    });
  });

  describe("streamAdminConversation", () => {
    it("devrait enregistrer la session SSE avec la clé conv:id", async () => {
      const mockSession = { id: "sse-admin" };
      let registeredKey = "";
      SseService.setupSession = async () => mockSession as any;
      SseService.registerSession = (key: string) => {
        registeredKey = key;
      };

      const req: any = { params: { id: "conv-100" } };
      const res: any = {};

      await AdminController.streamAdminConversation(req, res);

      assert.strictEqual(registeredKey, "conv:conv-100");
    });
  });

  describe("streamEventBusDebug", () => {
    it("devrait s'abonner à l'eventBus et désabonner lors de la fermeture de la requête", async () => {
      const pushedEvents: any[] = [];
      const mockSession = {
        push: (data: any, event: string) => {
          pushedEvents.push({ data, event });
        },
      };
      SseService.setupSession = async () => mockSession as any;

      const mockReq = new EventEmitter() as any;
      const res: any = {};

      await AdminController.streamEventBusDebug(mockReq, res);

      // Publier un événement sur l'EventBus
      eventBus.publish("test.debug", { message: "hello" }, "corr-1");

      assert.strictEqual(pushedEvents.length, 1);
      assert.strictEqual(pushedEvents[0].event, "eventbus.debug");
      assert.strictEqual(pushedEvents[0].data.topic, "test.debug");
      assert.strictEqual(pushedEvents[0].data.correlationId, "corr-1");

      // Simuler l'événement close du client HTTP
      mockReq.emit("close");

      // Vérifier que le désabonnement a bien fonctionné
      eventBus.publish("test.debug", { message: "hello2" }, "corr-2");
      assert.strictEqual(pushedEvents.length, 1);
    });
  });
});
