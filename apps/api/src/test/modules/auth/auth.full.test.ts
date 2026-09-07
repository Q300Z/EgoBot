import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService, AuthController, AuthRepository } from "../../../modules/auth";
import type { Request, Response } from "express";

describe("AuthModule Full Coverage", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		AuthService.init();
	});

	it("AuthRepository - getEgobotConfig, saveEgobotConfig, deleteEgobotConfig", async () => {
		const mockConfig = {
			url: "https://api.agelid.com",
			model: "CHATBOT" as const,
			email: "test@agelid.com",
			user: "u1",
			client: "c1",
			db_key: "k1",
			dev: "true",
		};

		vi.spyOn(AuthRepository, "getEgobotConfig").mockResolvedValue(mockConfig);
		vi.spyOn(AuthRepository, "saveEgobotConfig").mockResolvedValue();
		vi.spyOn(AuthRepository, "deleteEgobotConfig").mockResolvedValue();
		vi.spyOn(AuthRepository, "existsEgobotConfig").mockResolvedValue(true);

		const retrieved = await AuthRepository.getEgobotConfig("u1");
		expect(retrieved).toEqual(mockConfig);

		await AuthRepository.saveEgobotConfig("u1", mockConfig);
		expect(AuthRepository.saveEgobotConfig).toHaveBeenCalled();

		const exists = await AuthRepository.existsEgobotConfig("u1");
		expect(exists).toBe(true);

		await AuthRepository.deleteEgobotConfig("u1");
		expect(AuthRepository.deleteEgobotConfig).toHaveBeenCalled();
	});

	it("AuthController - should handle login (classic) request", async () => {
		const loginRes = { token: "tok123", user: { id: "u1", email: "u@example.com", role: "USER", dev: "false" } };
		vi.spyOn(AuthService, "loginClassic").mockResolvedValue(loginRes);

		const resJson = vi.fn();
		const resStatus = vi.fn().mockReturnValue({ json: resJson });
		const mockRes = { status: resStatus, json: resJson } as unknown as Response;

		const mockReq = {
			correlationId: "corr-1",
			validatedData: {
				body: {
					email: "u@example.com",
					password: "password123",
				},
			},
		} as unknown as Request;

		await AuthController.login(mockReq, mockRes);
		expect(resStatus).toHaveBeenCalledWith(200);
	});

	it("PasswordService - should hash and verify password securely", async () => {
		const { PasswordService } = await import("../../../modules/auth/AuthService");
		const password = "mySecretPassword123!";
		const hash = await PasswordService.hash(password);

		expect(hash).toBeDefined();
		expect(hash).toContain(":");

		const isMatch = await PasswordService.verify(password, hash);
		expect(isMatch).toBe(true);

		const isWrongMatch = await PasswordService.verify("wrongPassword", hash);
		expect(isWrongMatch).toBe(false);
	});

	it("AuthService - should register a new classic user and reject duplicates", async () => {
		const mockUser = {
			id: "user-uuid-1",
			email: "alice@example.com",
			username: "alice",
			password_hash: "mocked_hash",
			role: "USER",
			created_at: new Date(),
			updated_at: new Date(),
		};

		vi.spyOn(AuthRepository, "findUserByEmail").mockResolvedValueOnce(null);
		vi.spyOn(AuthRepository, "findUserByUsername").mockResolvedValueOnce(null);
		vi.spyOn(AuthRepository, "createUser").mockResolvedValueOnce(mockUser);

		const result = await AuthService.register({
			email: "alice@example.com",
			password: "password123",
			username: "alice",
		});

		expect(result.token).toBeDefined();
		expect(result.user.email).toBe("alice@example.com");
		expect(result.user.username).toBe("alice");

		// Test duplicate email
		vi.spyOn(AuthRepository, "findUserByEmail").mockResolvedValueOnce(mockUser);
		await expect(
			AuthService.register({
				email: "alice@example.com",
				password: "password123",
			}),
		).rejects.toThrow("Un utilisateur avec cette adresse email existe déjà.");

		// Test duplicate username
		vi.spyOn(AuthRepository, "findUserByEmail").mockResolvedValueOnce(null);
		vi.spyOn(AuthRepository, "findUserByUsername").mockResolvedValueOnce(mockUser);
		await expect(
			AuthService.register({
				email: "other@example.com",
				password: "password123",
				username: "alice",
			}),
		).rejects.toThrow("Ce nom d'utilisateur est déjà pris.");
	});

	it("AuthService - should login classic user with email or username", async () => {
		const { PasswordService } = await import("../../../modules/auth/AuthService");
		const hash = await PasswordService.hash("validPassword123");

		const mockUser = {
			id: "user-uuid-2",
			email: "bob@example.com",
			username: "bobby",
			password_hash: hash,
			role: "ADMIN",
			created_at: new Date(),
			updated_at: new Date(),
		};

		vi.spyOn(AuthRepository, "findUserByIdentifier").mockResolvedValue(mockUser);

		const result = await AuthService.loginClassic({
			emailOrUsername: "bob@example.com",
			password: "validPassword123",
		});

		expect(result.token).toBeDefined();
		expect(result.user.email).toBe("bob@example.com");
		expect(result.user.role).toBe("ADMIN");

		// Test invalid password
		await expect(
			AuthService.loginClassic({
				emailOrUsername: "bob@example.com",
				password: "wrongPassword",
			}),
		).rejects.toThrow("Identifiants incorrects.");

		// Test non-existent user
		vi.spyOn(AuthRepository, "findUserByIdentifier").mockResolvedValueOnce(null);
		await expect(
			AuthService.loginClassic({
				emailOrUsername: "ghost@example.com",
				password: "anyPassword",
			}),
		).rejects.toThrow("Identifiants incorrects.");
	});

	it("AuthService - should getMe for classic user and fallback for Egobot", async () => {
		const mockUser = {
			id: "user-uuid-3",
			email: "charlie@example.com",
			username: "charlie",
			password_hash: "hash",
			role: "USER",
			created_at: new Date(),
			updated_at: new Date(),
		};

		vi.spyOn(AuthRepository, "findUserById").mockResolvedValueOnce(mockUser);
		const meUser = await AuthService.getMe("user-uuid-3");
		expect(meUser.email).toBe("charlie@example.com");
		expect((meUser as any).password_hash).toBeUndefined();

		// Fallback for Egobot
		vi.spyOn(AuthRepository, "findUserById").mockResolvedValueOnce(null);
		vi.spyOn(AuthRepository, "getEgobotConfig").mockResolvedValueOnce({
			url: "https://Egobot.com",
			model: "CHATBOT",
			email: "Egobot@agelid.com",
			user: "Egobot-user",
		});

		const meEgobot = await AuthService.getMe("Egobot-user");
		expect(meEgobot.email).toBe("Egobot@agelid.com");
		expect(meEgobot.role).toBe("ADMIN");
	});

	it("AuthController - should handle register and getMe handlers", async () => {
		const resJson = vi.fn();
		const resStatus = vi.fn().mockReturnValue({ json: resJson });
		const mockRes = { status: resStatus, json: resJson } as unknown as Response;

		// Register handler
		vi.spyOn(AuthService, "register").mockResolvedValueOnce({
			token: "new-token",
			user: { id: "new-id", email: "new@example.com", role: "USER" },
		});

		const mockReqRegister = {
			correlationId: "corr-1",
			validatedData: {
				body: { email: "new@example.com", password: "password123" },
			},
		} as unknown as Request;

		await AuthController.register(mockReqRegister, mockRes);
		expect(resStatus).toHaveBeenCalledWith(201);

		// getMe handler
		vi.spyOn(AuthService, "getMe").mockResolvedValueOnce({
			id: "user-1",
			email: "me@example.com",
			role: "USER",
		});

		const mockReqGetMe = {
			correlationId: "corr-2",
			user: { id: "user-1", email: "me@example.com", role: "USER", dev: "false", client_id: "default" },
		} as unknown as Request;

		await AuthController.getMe(mockReqGetMe, mockRes);
		expect(resStatus).toHaveBeenCalledWith(200);
	});
});
