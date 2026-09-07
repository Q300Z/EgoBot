import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminController, AdminRepository, AdminService, AdminCommands } from "../../../modules/admin";
import { prisma } from "../../../config/db";
import { eventBus } from "../../../core/bus/eventBus";
import type { Request, Response } from "express";

describe("AdminModule Full Coverage", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		AdminService.init();
	});

	it("AdminRepository - findByIdAdmin and findManyAdmin", async () => {
		const mockConversation = {
			id: "c-admin",
			title: "Admin Conv",
			user_id: "u-admin",
			client_id: "cl-admin",
			model: "CHATBOT",
			created_at: new Date(),
			messages: [],
			jobs: [],
		};

		vi.spyOn(prisma.conversation, "findUnique").mockResolvedValue(mockConversation as any);
		vi.spyOn(prisma.conversation, "findMany").mockResolvedValue([mockConversation] as any);
		vi.spyOn(prisma.conversation, "count").mockResolvedValue(1);

		const single = await AdminRepository.findByIdAdmin("c-admin");
		expect(single?.id).toBe("c-admin");

		const many = await AdminRepository.findManyAdmin({
			page: "1",
			limit: "10",
			search: "Admin",
			title: "Conv",
			model: "CHATBOT",
		});
		expect(many).toBeDefined();
	});

	it("AdminController - getConversations, getConversationDetails, streamAdminConversationEvents", async () => {
		const controller = new AdminController();
		vi.spyOn(eventBus, "request").mockImplementation(async (cmd: any) => {
			if (cmd.name === AdminCommands.listConversations.name) {
				return { items: [], total: 0, page: 1, limit: 10 };
			}
			if (cmd.name === AdminCommands.getConversationDetails.name) {
				return { id: "c-1", stats: {} };
			}
			return null;
		});

		const resJson = vi.fn();
		const resStatus = vi.fn().mockReturnValue({ json: resJson });
		const mockRes = {
			status: resStatus,
			json: resJson,
			writeHead: vi.fn(),
			write: vi.fn(),
			on: vi.fn(),
			flush: vi.fn(),
		} as unknown as Response;

		const mockReq = { query: {}, params: { id: "c-1" }, correlationId: "corr-1", headers: {} } as unknown as Request;

		await controller.getConversations(mockReq, mockRes);
		expect(resStatus).toHaveBeenCalledWith(200);

		await controller.getConversationDetails(mockReq, mockRes);
		expect(resStatus).toHaveBeenCalledWith(200);

		vi.spyOn(AdminRepository, "findByIdAdmin").mockResolvedValue({
			id: "c-1",
			jobs: [],
		} as any);

		await controller.streamAdminConversationEvents(mockReq, mockRes);
		expect(mockRes.writeHead).toHaveBeenCalled();
	});
});
