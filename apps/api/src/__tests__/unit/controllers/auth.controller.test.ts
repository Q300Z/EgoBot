import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AuthController } from "../../../controllers/auth.controller.js";
import { UserRepository } from "../../../repositories/user.repository.js";
import { env } from "../../../config/env.js";

// Helper pour simuler un objet Response Express
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

describe("AuthController Unit Tests", () => {
  const originalFindByEmail = UserRepository.findByEmail;
  const originalFindById = UserRepository.findById;
  const originalCreate = UserRepository.create;

  beforeEach(() => {
    UserRepository.findByEmail = originalFindByEmail;
    UserRepository.findById = originalFindById;
    UserRepository.create = originalCreate;
  });

  describe("login", () => {
    it("devrait retourner 400 si email ou password manquant", async () => {
      const req: any = { body: { email: "" } };
      const res = createMockResponse();

      await AuthController.login(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: "Champs email et mot de passe requis" });
    });

    it("devrait retourner 401 si l'utilisateur n'existe pas", async () => {
      UserRepository.findByEmail = async () => null as any;
      const req: any = { body: { email: "inconnu@test.com", password: "password123" } };
      const res = createMockResponse();

      await AuthController.login(req, res);

      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.body, { error: "Identifiants invalides" });
    });

    it("devrait retourner 401 si le mot de passe est incorrect", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@test.com",
        password_hash: await bcrypt.hash("password123", 10),
        role: "USER" as const,
        created_at: new Date(),
        updated_at: new Date(),
      };
      UserRepository.findByEmail = async () => mockUser as any;

      const req: any = { body: { email: "test@test.com", password: "mauvaismotdepasse" } };
      const res = createMockResponse();

      await AuthController.login(req, res);

      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.body, { error: "Identifiants invalides" });
    });

    it("devrait retourner 200 avec token et infos user si identifiants valides", async () => {
      const mockDate = new Date();
      const mockUser = {
        id: "user-123",
        email: "test@test.com",
        password_hash: await bcrypt.hash("password123", 10),
        role: "USER" as const,
        created_at: mockDate,
        updated_at: mockDate,
      };
      UserRepository.findByEmail = async () => mockUser as any;

      const req: any = { body: { email: "test@test.com", password: "password123" } };
      const res = createMockResponse();

      await AuthController.login(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.id, "user-123");
      assert.strictEqual(res.body.user.email, "test@test.com");
      assert.strictEqual(res.body.user.role, "USER");

      // Vérifier la signature du token JWT
      const decoded: any = jwt.verify(res.body.token, env.JWT_SECRET);
      assert.strictEqual(decoded.id, "user-123");
      assert.strictEqual(decoded.email, "test@test.com");
    });
  });

  describe("register", () => {
    it("devrait retourner 400 si email/password invalide (mot de passe < 6 caractères)", async () => {
      const req: any = { body: { email: "new@test.com", password: "123" } };
      const res = createMockResponse();

      await AuthController.register(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.body, { error: "Email et mot de passe de 6 caractères minimum requis" });
    });

    it("devrait retourner 409 si un utilisateur existe déjà avec cet email", async () => {
      UserRepository.findByEmail = async () => ({ id: "existing-1" }) as any;

      const req: any = { body: { email: "existing@test.com", password: "password123" } };
      const res = createMockResponse();

      await AuthController.register(req, res);

      assert.strictEqual(res.statusCode, 409);
      assert.deepStrictEqual(res.body, { error: "Un compte avec cet email existe déjà" });
    });

    it("devrait créer le compte et retourner 201 avec token", async () => {
      const mockDate = new Date();
      UserRepository.findByEmail = async () => null as any;
      UserRepository.create = async (data: any) => ({
        id: "new-user-id",
        email: data.email,
        password_hash: data.password_hash,
        role: data.role || "USER",
        created_at: mockDate,
        updated_at: mockDate,
      }) as any;

      const req: any = { body: { email: "newuser@test.com", password: "password123" } };
      const res = createMockResponse();

      await AuthController.register(req, res);

      assert.strictEqual(res.statusCode, 201);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, "newuser@test.com");
      assert.strictEqual(res.body.user.role, "USER");
    });
  });

  describe("me", () => {
    it("devrait retourner 404 si l'utilisateur connecté n'existe plus en BDD", async () => {
      UserRepository.findById = async () => null as any;

      const req: any = { user: { id: "unknown-user", email: "old@test.com", role: "USER" } };
      const res = createMockResponse();

      await AuthController.me(req, res);

      assert.strictEqual(res.statusCode, 404);
      assert.deepStrictEqual(res.body, { error: "Utilisateur non trouvé" });
    });

    it("devrait retourner 200 avec les informations utilisateur du profil", async () => {
      const mockDate = new Date();
      const mockUser = {
        id: "user-me",
        email: "me@test.com",
        password_hash: "hash",
        role: "USER" as const,
        created_at: mockDate,
        updated_at: mockDate,
      };
      UserRepository.findById = async () => mockUser as any;

      const req: any = { user: { id: "user-me", email: "me@test.com", role: "USER" } };
      const res = createMockResponse();

      await AuthController.me(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.id, "user-me");
      assert.strictEqual(res.body.email, "me@test.com");
      assert.strictEqual(res.body.role, "USER");
    });
  });
});
