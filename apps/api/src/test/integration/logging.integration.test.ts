import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController, loginV1 as login } from "../../modules/auth";
import { ConversationController } from "../../modules/conversation";
import { LoggerFactory } from "../../config/logger";
import { getValidatedData } from "../../middlewares/validation.middleware";
import { eventBus } from "../../core/bus/eventBus";
import { AuthCommands } from "../../modules/auth/auth.commands";
import { ConversationCommands } from "../../modules/conversation/conversation.commands";
import type { Request, Response } from "express";
import type { UserPayload } from "../../modules/auth";

// Mock dependencies
vi.mock("../../config/logger", () => {
	const mockLoggerInstance = {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
	(globalThis as any).mockLoggerInstance = mockLoggerInstance;
	return {
		LoggerFactory: {
			getLogger: vi.fn().mockImplementation(() => mockLoggerInstance),
		},
	};
});

vi.mock("../../middlewares/validation.middleware", () => ({
	getValidatedData: vi.fn(),
}));

vi.mock("../../config/redis", () => ({
	redisWriter: { set: vi.fn() },
	redisReader: {
		get: vi
			.fn()
			.mockResolvedValue(
				JSON.stringify({ user: "user-1", email: "test@example.com", client: "client-1", model: "CHATBOT" }),
			),
	},
}));

vi.mock("../../config/db", () => ({
	prisma: {
		conversation: {
			findMany: vi.fn().mockResolvedValue([]),
			findUnique: vi.fn().mockResolvedValue({ id: "conv-1", user_id: "user-1" }),
		},
	},
}));

describe("Controller Logging Integration", () => {
	const mockLoggerInstance = (globalThis as any).mockLoggerInstance;
	let req: Partial<Request>;
	let res: Partial<Response>;

	beforeEach(() => {
		vi.clearAllMocks();
		req = {
			correlationId: "req-123",
			body: { user: "user-1", email: "test@example.com", client: "client-1", dev: "false" },
			user: {
				id: "user-1",
				email: "test@example.com",
				client_id: "client-1",
				role: "USER",
				dev: "false",
			} as UserPayload,
		};
		res = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
		};
		vi.mocked(getValidatedData).mockReturnValue({
			body: { user: "user-1", email: "test@example.com", client: "client-1", dev: "false" },
			params: { id: "conv-1" },
		} as any);
	});

	it("AuthController.login should log with correlationId", async () => {
		await login(req as Request, res as Response);

		expect(mockLoggerInstance.info).toHaveBeenCalledWith(
			expect.stringContaining("Session Logipol initialisée"),
			expect.objectContaining({ correlationId: "req-123" }),
		);
	});

	it("ConversationController.getConversations should log with correlationId and userId", async () => {
		const controller = new ConversationController();
		eventBus.reset();
		eventBus.registerHandler(AuthCommands.getUserConfig, async () => ({
			user: "user-1",
			email: "test@example.com",
			client: "client-1",
			model: "CHATBOT" as const,
			url: "http://test",
			db_key: "db",
			dev: "false",
		}));
		eventBus.registerHandler(ConversationCommands.list, async () => []);

		await controller.getConversations(req as Request, res as Response);

		expect(mockLoggerInstance.info).toHaveBeenCalledWith(
			expect.stringContaining("Récupération des listes pour l'utilisateur"),
			expect.objectContaining({ correlationId: "req-123", userId: "user-1" }),
		);
	});
});
