import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	ConversationController,
	ConversationRepository,
	ConversationService,
	ConversationCommands,
} from "../../../modules/conversation";
import { prisma } from "../../../config/db";
import { redisWriter } from "../../../config/redis";
import { eventBus } from "../../../core/bus/eventBus";
import { AuthCommands } from "../../../modules/auth/auth.commands";
import type { Request, Response } from "express";

describe("ConversationModule Full Coverage", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		ConversationService.init();
	});

	it("ConversationRepository - findMany, findById, ensureExists, deleteLogical", async () => {
		const mockConv = {
			id: "c-1",
			user_id: "u-1",
			client_id: "cl-1",
			title: "Discussion",
			model: "CHATBOT" as const,
			created_at: new Date(),
			updated_at: new Date(),
			deleted_at: null,
			messages: [],
			jobs: [{ id: "j-1" }],
		};

		vi.spyOn(prisma.conversation, "findMany").mockResolvedValue([mockConv] as any);
		vi.spyOn(prisma.conversation, "findUnique").mockResolvedValue(mockConv as any);
		vi.spyOn(prisma.conversation, "create").mockResolvedValue(mockConv as any);
		vi.spyOn(prisma.conversation, "update").mockResolvedValue(mockConv as any);
		vi.spyOn(redisWriter, "multi").mockReturnValue({
			del: vi.fn().mockReturnThis(),
			exec: vi.fn().mockResolvedValue([]),
		} as any);

		const list = await ConversationRepository.findMany("u-1", "cl-1", "CHATBOT");
		expect(list.length).toBe(1);

		const single = await ConversationRepository.findById("c-1", "u-1");
		expect(single?.id).toBe("c-1");

		const ensured = await ConversationRepository.ensureExists({
			id: "c-1",
			user_id: "u-1",
			client_id: "cl-1",
			title: "Discussion",
			model: "CHATBOT",
		});
		expect(ensured).toBeDefined();

		const deleted = await ConversationRepository.deleteLogical("c-1", "u-1");
		expect(deleted).toBe(true);
	});

	it("ConversationController - getConversations, getConversation, deleteConversation", async () => {
		const controller = new ConversationController();
		const mockUser = { id: "u-1", email: "user@test.com", client_id: "cl-1", role: "USER", dev: "false" };

		vi.spyOn(eventBus, "request").mockImplementation(async (cmd: any, input: any) => {
			if (cmd.name === AuthCommands.getUserConfig.name) {
				return { model: "CHATBOT", dev: "false" };
			}
			if (cmd.name === ConversationCommands.list.name) {
				return [{ id: "c-1", title: "Test Conv" }];
			}
			if (cmd.name === ConversationCommands.getById.name) {
				return { id: "c-1", title: "Test Conv", messages: [] };
			}
			if (cmd.name === ConversationCommands.deleteLogical.name) {
				return { success: true };
			}
			return null;
		});

		const resJson = vi.fn();
		const resStatus = vi.fn().mockReturnValue({ json: resJson, send: vi.fn() });
		const mockRes = { status: resStatus, json: resJson } as unknown as Response;

		const mockReqList = { user: mockUser } as unknown as Request;
		await controller.getConversations(mockReqList, mockRes);
		expect(resStatus).toHaveBeenCalledWith(200);

		const mockReqGet = { user: mockUser, validatedData: { params: { id: "c-1" } } } as unknown as Request;
		await controller.getConversation(mockReqGet, mockRes);
		expect(resStatus).toHaveBeenCalledWith(200);

		const mockReqDelete = { user: mockUser, validatedData: { params: { id: "c-1" } } } as unknown as Request;
		await controller.deleteConversation(mockReqDelete, mockRes);
		expect(resStatus).toHaveBeenCalledWith(202);
	});
});
