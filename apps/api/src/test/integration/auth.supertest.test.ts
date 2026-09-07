import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../../app";
import { redisWriter } from "../../config/redis";

vi.mock("../../config/redis", () => ({
	redisWriter: {
		set: vi.fn().mockResolvedValue("OK"),
	},
	redisReader: {
		exists: vi.fn().mockResolvedValue(0),
	},
	connectRedisClients: vi.fn().mockResolvedValue(undefined),
}));

// Mock database connection
vi.mock("../../config/db", () => ({
	prisma: {},
}));

describe("Auth Supertest Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("POST /api/v1/auth/login - should login successfully and return a JWT", async () => {
		const payload = {
			user: "user-123",
			email: "test@example.com",
			client: "client-456",
			dev: "true",
			url: "http://logipol.test",
			model: "CHATBOT" as const,
			db_key: "db-123",
		};

		const response = await request(app).post("/api/v1/auth/login").send(payload).expect(200);

		expect(response.body.data).toBeDefined();
		expect(response.body.data.token).toBeDefined();
		expect(response.body.data.user.email).toBe("test@example.com");
		expect(redisWriter.set).toHaveBeenCalled();
	});

	it("POST /api/v1/auth/login - should fail validation with invalid payload", async () => {
		const invalidPayload = {
			user: "user-123",
			// Missing email
			client: "client-456",
			dev: "true",
			url: "http://logipol.test",
			model: "CHATBOT",
			db_key: "db-123",
		};

		const response = await request(app).post("/api/v1/auth/login").send(invalidPayload).expect(422);

		expect(response.body.error).toBeDefined();
	});
});
