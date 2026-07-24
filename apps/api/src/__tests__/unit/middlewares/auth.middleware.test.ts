import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import jwt from "jsonwebtoken";
import { authMiddleware, sseAuthMiddleware, requireAdmin } from "../../../middlewares/auth.middleware.js";
import { env } from "../../../config/env.js";
import { JobRepository } from "../../../repositories/job.repository.js";
import { ConversationRepository } from "../../../repositories/conversation.repository.js";

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

describe("Auth Middleware Unit Tests", () => {
  describe("authMiddleware", () => {
    it("devrait retourner 401 si le header Authorization est manquant", () => {
      const req: any = { headers: {} };
      const res = createMockResponse();
      let nextCalled = false;

      authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.body, { success: false, error: "Accès non autorisé" });
      assert.strictEqual(nextCalled, false);
    });

    it("devrait retourner 401 si le jeton JWT est invalide", () => {
      const req: any = { headers: { authorization: "Bearer invalid_token" } };
      const res = createMockResponse();
      let nextCalled = false;

      authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.body, { success: false, error: "Jeton JWT invalide ou expiré" });
      assert.strictEqual(nextCalled, false);
    });

    it("devrait décoder le jeton et appeler next() si le JWT est valide", () => {
      const payload = { id: "user-1", email: "user@test.com", role: "USER" };
      const token = jwt.sign(payload, env.JWT_SECRET);
      const req: any = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockResponse();
      let nextCalled = false;

      authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.user.id, "user-1");
      assert.strictEqual(req.user.email, "user@test.com");
      assert.strictEqual(req.user.role, "USER");
    });
  });

  describe("sseAuthMiddleware", () => {
    const originalFindJobById = JobRepository.findById;
    const originalFindConvById = ConversationRepository.findById;

    beforeEach(() => {
      JobRepository.findById = originalFindJobById;
      ConversationRepository.findById = originalFindConvById;
    });

    it("devrait valider l'accès si un token JWT valide est passé en query parameter", async () => {
      const token = jwt.sign({ id: "user-sse", email: "sse@test.com", role: "USER" }, env.JWT_SECRET);
      const req: any = { query: { token }, params: {} };
      const res = createMockResponse();
      let nextCalled = false;

      await sseAuthMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.user.id, "user-sse");
    });

    it("devrait valider l'accès via le jobId si aucun token valide n'est fourni", async () => {
      JobRepository.findById = async (id: string) => ({ id: "job-sse-1", conversation_id: "conv-sse-1" }) as any;
      ConversationRepository.findById = async (id: string) => ({ id: "conv-sse-1", user_id: "owner-user-id" }) as any;

      const req: any = { query: {}, params: { jobId: "job-sse-1" } };
      const res = createMockResponse();
      let nextCalled = false;

      await sseAuthMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.user.id, "owner-user-id");
    });

    it("devrait retourner 401 si le token est absent/invalide et le jobId est inconnu", async () => {
      JobRepository.findById = async () => null as any;

      const req: any = { query: {}, params: { jobId: "bad-job-id" } };
      const res = createMockResponse();
      let nextCalled = false;

      await sseAuthMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.body, { success: false, error: "Accès SSE refusé (Job ID invalide)" });
      assert.strictEqual(nextCalled, false);
    });
  });

  describe("requireAdmin", () => {
    it("devrait retourner 403 si l'utilisateur n'est pas authentifié", () => {
      const req: any = {};
      const res = createMockResponse();
      let nextCalled = false;

      requireAdmin(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 403);
      assert.deepStrictEqual(res.body, { success: false, error: "Accès réservé aux administrateurs" });
      assert.strictEqual(nextCalled, false);
    });

    it("devrait retourner 403 si le rôle de l'utilisateur n'est pas ADMIN", () => {
      const req: any = { user: { id: "u1", role: "USER" } };
      const res = createMockResponse();
      let nextCalled = false;

      requireAdmin(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(nextCalled, false);
    });

    it("devrait appeler next() si l'utilisateur a le rôle ADMIN", () => {
      const req: any = { user: { id: "admin1", role: "ADMIN" } };
      const res = createMockResponse();
      let nextCalled = false;

      requireAdmin(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });
  });
});
