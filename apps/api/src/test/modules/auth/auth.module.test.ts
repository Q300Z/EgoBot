import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthCommands, AuthRepository, initAuthModule } from "../../../modules/auth";
import { eventBus } from "../../../core/bus/eventBus";
import { jwtVerify } from "jose";
import { env } from "../../../config/env";

describe("AuthModule (TDD)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		initAuthModule();
	});

	it("should authenticate via loginClassic command and return a signed JWT", async () => {
		const { PasswordService } = await import("../../../modules/auth/AuthService");
		const hash = await PasswordService.hash("password123");

		vi.spyOn(AuthRepository, "findUserByIdentifier").mockResolvedValue({
			id: "user-123",
			email: "user@agelid.com",
			username: "user123",
			password_hash: hash,
			role: "ADMIN",
			created_at: new Date(),
			updated_at: new Date(),
		});
		vi.spyOn(AuthRepository, "saveEgobotConfig").mockResolvedValue();

		const result = await eventBus.request(AuthCommands.loginClassic, {
			emailOrUsername: "user@agelid.com",
			password: "password123",
		});

		expect(result.user.email).toBe("user@agelid.com");
		expect(result.token).toBeDefined();

		const secret = new TextEncoder().encode(env.SECRET_KEY);
		const { payload: decoded } = await jwtVerify(result.token, secret);
		expect(decoded.id).toBe("user-123");
		expect(decoded.email).toBe("user@agelid.com");
		expect(decoded.role).toBe("ADMIN");
	});

	it("should get and delete user config via commands", async () => {
		const mockConfig = {
			url: "https://Egobot.example.com",
			model: "CHATBOT" as const,
			email: "user@test.com",
			user: "user-123",
			client: "client-456",
			db_key: "key-789",
			dev: "false",
		};

		vi.spyOn(AuthRepository, "getEgobotConfig").mockResolvedValue(mockConfig);
		vi.spyOn(AuthRepository, "deleteEgobotConfig").mockResolvedValue();

		const config = await eventBus.request(AuthCommands.getUserConfig, { userId: "user-123" });
		expect(config).toEqual(mockConfig);

		const deleteRes = await eventBus.request(AuthCommands.deleteUserConfig, { userId: "user-123" });
		expect(deleteRes).toEqual({ success: true });
	});
});
