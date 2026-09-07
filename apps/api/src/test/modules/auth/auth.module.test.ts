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

	it("should authenticate via loginV1 command and store session in Redis", async () => {
		const saveSpy = vi.spyOn(AuthRepository, "saveLogipolConfig").mockResolvedValue();

		const payload = {
			url: "https://logipol.example.com",
			model: "CHATBOT" as const,
			email: "user@agelid.com",
			user: "user-123",
			client: "client-456",
			db_key: "key-789",
			dev: "true",
		};

		const result = await eventBus.request(AuthCommands.loginV1, payload);

		expect(saveSpy).toHaveBeenCalledWith("user-123", payload);
		expect(result.user).toEqual({
			email: "user@agelid.com",
			dev: "true",
		});
		expect(result.token).toBeDefined();

		const secret = new TextEncoder().encode(env.SECRET_KEY);
		const { payload: decoded } = await jwtVerify(result.token, secret);
		expect(decoded.id).toBe("user-123");
		expect(decoded.email).toBe("user@agelid.com");
		expect(decoded.role).toBe("ADMIN"); // @agelid.com + dev === "true"
	});

	it("should get and delete user config via commands", async () => {
		const mockConfig = {
			url: "https://logipol.example.com",
			model: "CHATBOT" as const,
			email: "user@test.com",
			user: "user-123",
			client: "client-456",
			db_key: "key-789",
			dev: "false",
		};

		vi.spyOn(AuthRepository, "getLogipolConfig").mockResolvedValue(mockConfig);
		vi.spyOn(AuthRepository, "deleteLogipolConfig").mockResolvedValue();

		const config = await eventBus.request(AuthCommands.getUserConfig, { userId: "user-123" });
		expect(config).toEqual(mockConfig);

		const deleteRes = await eventBus.request(AuthCommands.deleteUserConfig, { userId: "user-123" });
		expect(deleteRes).toEqual({ success: true });
	});
});
