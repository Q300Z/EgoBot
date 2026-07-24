import { describe, it } from "node:test";
import assert from "node:assert";
import { authRateLimiter, messageRateLimiter } from "../../../middlewares/rateLimit.middleware.js";

describe("Rate Limit Middleware Unit Tests", () => {
  it("authRateLimiter devrait être une fonction middleware Express valide", () => {
    assert.strictEqual(typeof authRateLimiter, "function");
  });

  it("messageRateLimiter devrait être une fonction middleware Express valide", () => {
    assert.strictEqual(typeof messageRateLimiter, "function");
  });
});
