import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { validateRequest } from "../../../middlewares/validate.middleware.js";

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

describe("Validate Middleware Unit Tests", () => {
  const bodySchema = z.object({
    email: z.string().email("Email invalide"),
    age: z.number().min(18, "Doit être majeur"),
  });

  const querySchema = z.object({
    limit: z.string().optional(),
  });

  const paramsSchema = z.object({
    id: z.string().uuid("ID UUID requis"),
  });

  it("devrait passer la validation et appeler next() avec des données valides", () => {
    const middleware = validateRequest({ body: bodySchema, query: querySchema, params: paramsSchema });

    const req: any = {
      body: { email: "valid@test.com", age: 25 },
      query: { limit: "10" },
      params: { id: "123e4567-e89b-12d3-a456-426614174000" },
    };
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.body.email, "valid@test.com");
  });

  it("devrait retourner 400 avec les détails si la validation body ou params échoue", () => {
    const middleware = validateRequest({ body: bodySchema, params: paramsSchema });

    const req: any = {
      body: { email: "invalide-email", age: 15 },
      params: { id: "not-a-uuid" },
    };
    const res = createMockResponse();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, "Données de requête invalides");
    assert.ok(Array.isArray(res.body.details));
    assert.ok(res.body.details.length >= 2);
    assert.strictEqual(nextCalled, false);
  });

  it("devrait transmettre les erreurs non-Zod à next(err)", () => {
    const customSchema: any = {
      parse: () => {
        throw new Error("Erreur système inattendue");
      },
    };
    const middleware = validateRequest({ body: customSchema });

    const req: any = { body: {} };
    const res = createMockResponse();
    let passedError: any = null;

    middleware(req, res, (err: any) => {
      passedError = err;
    });

    assert.ok(passedError);
    assert.strictEqual(passedError.message, "Erreur système inattendue");
  });
});
