import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { UserRepository } from "../../../repositories/user.repository.js";
import { ConversationRepository } from "../../../repositories/conversation.repository.js";
import { JobRepository } from "../../../repositories/job.repository.js";
import { WorkerRepository } from "../../../repositories/worker.repository.js";
import { prisma } from "../../../config/db.js";
import { valkeyReader, valkeyWriter } from "../../../config/valkey.js";

describe("Repositories Unit Tests", () => {
  describe("UserRepository", () => {
    beforeEach(() => {
      (prisma as any).user = {
        findUnique: async (args: any) => ({ id: args?.where?.id || "u-1", email: args?.where?.email || "test@test.com" }),
        create: async (args: any) => ({ id: "new-id", ...args.data }),
        findMany: async () => [{ id: "u-1" }, { id: "u-2" }],
        delete: async (args: any) => ({ id: args.where.id }),
      };
    });

    it("findByEmail devrait appeler prisma.user.findUnique", async () => {
      const res = await UserRepository.findByEmail("test@test.com");
      assert.strictEqual(res?.email, "test@test.com");
    });

    it("findById devrait appeler prisma.user.findUnique", async () => {
      const res = await UserRepository.findById("u-id");
      assert.strictEqual(res?.id, "u-id");
    });

    it("create devrait insérer l'utilisateur avec rôle par défaut USER", async () => {
      let createdData: any = null;
      (prisma as any).user.create = async (args: any) => {
        createdData = args.data;
        return { id: "new-id", ...args.data };
      };

      const res = await UserRepository.create({ email: "create@test.com", password_hash: "hash" });
      assert.strictEqual(createdData.role, "USER");
      assert.strictEqual(res.id, "new-id");
    });

    it("findAll devrait ordonner les utilisateurs par date de création", async () => {
      const res = await UserRepository.findAll();
      assert.strictEqual(res.length, 2);
    });

    it("delete devrait appeler prisma.user.delete", async () => {
      const res = await UserRepository.delete("del-id");
      assert.strictEqual(res.id, "del-id");
    });
  });

  describe("ConversationRepository", () => {
    beforeEach(() => {
      (prisma as any).conversation = {
        create: async (args: any) => ({ id: "conv-1", ...args.data }),
        findFirst: async (args: any) => ({ id: args.where.id, messages: [{ id: "m-1" }] }),
        findMany: async () => [{ id: "c-1" }],
        update: async (args: any) => ({ id: args.where.id, ...args.data }),
      };
      (prisma as any).message = {
        create: async (args: any) => ({ id: "msg-1", ...args.data }),
        update: async (args: any) => ({ id: args.where.id, ...args.data }),
      };
    });

    it("create devrait créer la conversation avec le modèle spécifié", async () => {
      const res = await ConversationRepository.create({ user_id: "u-1", title: "Test Conv", model: "ANALYTICS" });
      assert.strictEqual(res.model, "ANALYTICS");
      assert.strictEqual(res.user_id, "u-1");
    });

    it("findById devrait inclure les messages", async () => {
      const res = await ConversationRepository.findById("conv-1");
      assert.strictEqual(res?.id, "conv-1");
      assert.strictEqual(res?.messages.length, 1);
    });

    it("findByUserId devrait lister les conversations non supprimées", async () => {
      const res = await ConversationRepository.findByUserId("u-1");
      assert.strictEqual(res.length, 1);
    });

    it("softDelete devrait renseigner deleted_at", async () => {
      let updatedData: any = null;
      (prisma as any).conversation.update = async (args: any) => {
        updatedData = args.data;
        return { id: args.where.id, ...args.data };
      };

      await ConversationRepository.softDelete("conv-to-soft-delete");
      assert.ok(updatedData.deleted_at instanceof Date);
    });

    it("addMessage & updateMessageContent devraient interagir correctement avec prisma.message", async () => {
      const msg = await ConversationRepository.addMessage({ conversation_id: "c-1", role: "USER", content: "Hello" });
      assert.strictEqual(msg.content, "Hello");

      const updated = await ConversationRepository.updateMessageContent("msg-1", "Updated content");
      assert.strictEqual(updated.content, "Updated content");
    });
  });

  describe("JobRepository", () => {
    beforeEach(() => {
      (prisma as any).job = {
        create: async (args: any) => ({ ...args.data }),
        findUnique: async (args: any) => ({ id: args.where.id, status: "PENDING" }),
        update: async (args: any) => ({ id: args.where.id, ...args.data }),
        findMany: async () => [{ id: "stuck-1", status: "PENDING" }],
      };
    });

    it("create devrait insérer un job PENDING", async () => {
      const job = await JobRepository.create({
        id: "job-uuid",
        conversation_id: "c-1",
        user_prompt_id: "m-1",
        assistant_message_id: "m-2",
        model: "CHATBOT",
      });

      assert.strictEqual(job.id, "job-uuid");
      assert.strictEqual(job.status, "PENDING");
    });

    it("findById et update devraient fonctionner comme attendu", async () => {
      const found = await JobRepository.findById("j-1");
      assert.strictEqual(found?.status, "PENDING");

      const updated = await JobRepository.update("j-1", { status: "COMPLETED" });
      assert.strictEqual(updated.status, "COMPLETED");
    });

    it("findStuckJobs devrait chercher les jobs PENDING/IN_PROGRESS expirés", async () => {
      const stuck = await JobRepository.findStuckJobs(new Date());
      assert.strictEqual(stuck.length, 1);
    });
  });

  describe("WorkerRepository", () => {
    it("getActiveWorkerKeys & getActiveWorkersCount devraient filtrer la présence des workers", async () => {
      const originalKeys = valkeyReader.keys;
      valkeyReader.keys = async () => [
        "workers:presence:w-1:node-1",
        "workers:presence:w-2:node-2",
        "workers:presence:api:node-api",
      ] as any;

      const keys = await WorkerRepository.getActiveWorkerKeys();
      assert.deepStrictEqual(keys, ["workers:presence:w-1:node-1", "workers:presence:w-2:node-2"]);

      const count = await WorkerRepository.getActiveWorkersCount();
      assert.strictEqual(count, 2);

      valkeyReader.keys = originalKeys;
    });

    it("publishPresence devrait écrire dans Valkey avec expiration", async () => {
      const originalSet = valkeyWriter.set;
      let setArgs: any[] = [];
      valkeyWriter.set = async (...args: any[]) => {
        setArgs = args;
        return "OK" as any;
      };

      await WorkerRepository.publishPresence("node-99", { status: "ONLINE" });
      assert.strictEqual(setArgs[0], "workers:presence:api:node-99");
      assert.strictEqual(setArgs[2], "EX");
      assert.strictEqual(setArgs[3], 15);

      valkeyWriter.set = originalSet;
    });
  });
});
