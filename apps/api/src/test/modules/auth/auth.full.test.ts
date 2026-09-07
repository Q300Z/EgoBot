import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService, AuthController, AuthRepository } from "../../../modules/auth";
import { encodeBlowfish } from "../../../utils/crypto";
import { redisReader, redisWriter } from "../../../config/redis";
import type { Request, Response } from "express";

describe("AuthModule Full Coverage", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		AuthService.init();
	});

	it("AuthService - should process loginV2 with Blowfish payload", async () => {
		const clearPayload = "email=dev@agelid.com|user=user-v2|client=client-v2|db_key=db-v2|dev=true";
		const encryptedData = encodeBlowfish("IA@gelid2026", "", clearPayload);

		vi.spyOn(AuthRepository, "getLogipolConfig").mockResolvedValue(null);
		vi.spyOn(AuthRepository, "saveLogipolConfig").mockResolvedValue();

		const result = await AuthService.loginV2({
			url: "https://logipol.example.com",
			model: "CHATBOT",
			data: encryptedData,
		});

		expect(result.user.email).toBe("dev@agelid.com");
		expect(result.token).toBeDefined();
	});

	it("AuthService - should throw when Blowfish payload misses required fields", async () => {
		const invalidPayload = "foo=bar";
		const encryptedData = encodeBlowfish("IA@gelid2026", "", invalidPayload);

		await expect(
			AuthService.loginV2({
				url: "https://logipol.example.com",
				model: "CHATBOT",
				data: encryptedData,
			}),
		).rejects.toThrow();
	});

	it("AuthRepository - getLogipolConfig, saveLogipolConfig, deleteLogipolConfig", async () => {
		const mockConfig = {
			url: "https://api.agelid.com",
			model: "CHATBOT" as const,
			email: "test@agelid.com",
			user: "u1",
			client: "c1",
			db_key: "k1",
			dev: "true",
		};

		vi.spyOn(AuthRepository, "getLogipolConfig").mockResolvedValue(mockConfig);
		vi.spyOn(AuthRepository, "saveLogipolConfig").mockResolvedValue();
		vi.spyOn(AuthRepository, "deleteLogipolConfig").mockResolvedValue();
		vi.spyOn(AuthRepository, "existsLogipolConfig").mockResolvedValue(true);

		const retrieved = await AuthRepository.getLogipolConfig("u1");
		expect(retrieved).toEqual(mockConfig);

		await AuthRepository.saveLogipolConfig("u1", mockConfig);
		expect(AuthRepository.saveLogipolConfig).toHaveBeenCalled();

		const exists = await AuthRepository.existsLogipolConfig("u1");
		expect(exists).toBe(true);

		await AuthRepository.deleteLogipolConfig("u1");
		expect(AuthRepository.deleteLogipolConfig).toHaveBeenCalled();
	});

	it("AuthController - should handle loginV1 and loginV2 requests", async () => {
		const loginRes = { token: "tok123", user: { email: "u@agelid.com", dev: "true" } };
		vi.spyOn(AuthService, "loginV1").mockResolvedValue(loginRes);
		vi.spyOn(AuthService, "loginV2").mockResolvedValue(loginRes);

		const resJson = vi.fn();
		const resStatus = vi.fn().mockReturnValue({ json: resJson });
		const mockRes = { status: resStatus, json: resJson } as unknown as Response;

		const mockReqV1 = {
			validatedData: {
				body: {
					url: "https://logipol.com",
					model: "CHATBOT",
					email: "u@agelid.com",
					user: "u1",
					client: "c1",
					db_key: "k1",
					dev: "true",
				},
			},
		} as unknown as Request;

		await AuthController.loginV1(mockReqV1, mockRes);
		expect(resStatus).toHaveBeenCalledWith(200);

		const mockReqV2 = {
			validatedData: {
				body: {
					url: "https://logipol.com",
					model: "CHATBOT",
					data: "some-encrypted-data",
				},
			},
		} as unknown as Request;

		await AuthController.loginV2(mockReqV2, mockRes);
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

	it("AuthService - should getMe for classic user and fallback for logipol", async () => {
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

		// Fallback for Logipol
		vi.spyOn(AuthRepository, "findUserById").mockResolvedValueOnce(null);
		vi.spyOn(AuthRepository, "getLogipolConfig").mockResolvedValueOnce({
			url: "https://logipol.com",
			model: "CHATBOT",
			email: "logipol@agelid.com",
			user: "logipol-user",
			client: "client-1",
			db_key: "db-1",
			dev: "true",
		});

		const meLogipol = await AuthService.getMe("logipol-user");
		expect(meLogipol.email).toBe("logipol@agelid.com");
		expect(meLogipol.role).toBe("ADMIN");
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
