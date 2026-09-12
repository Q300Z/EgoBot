import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../../app";

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
	prisma: {
		user: {
			findUnique: vi.fn(),
			create: vi.fn(),
		},
	},
}));

describe("Auth Supertest Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("POST /api/v1/auth/login - should login successfully and return a JWT", async () => {
		const { AuthService } = await import("../../modules/auth/AuthService");
		const { PasswordService } = await import("../../modules/auth/AuthService");
		const hash = await PasswordService.hash("password123");

		vi.spyOn(AuthService, "loginClassic").mockResolvedValueOnce({
			token: "mocked-jwt-token",
			user: { id: "user-123", email: "test@example.com", role: "USER", dev: "false" },
		});

		const payload = {
			email: "test@example.com",
			password: "password123",
		};

		const response = await request(app).post("/api/v1/auth/login").send(payload).expect(200);

		expect(response.body.data).toBeDefined();
		expect(response.body.data.token).toBeDefined();
		expect(response.body.data.user.email).toBe("test@example.com");
	});

	it("POST /api/v1/auth/login - should fail validation with invalid payload", async () => {
		const invalidPayload = {
			// Missing password
			email: "test@example.com",
		};

		const response = await request(app).post("/api/v1/auth/login").send(invalidPayload).expect(422);

		expect(response.body.error).toBeDefined();
	});
});
