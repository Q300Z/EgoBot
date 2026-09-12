import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageController, MessageRepository, MessageService, MessageCommands } from "../../../modules/message";
import { prisma } from "../../../config/db";
import { eventBus } from "../../../core/bus/eventBus";
import { JobCommands } from "../../../modules/job/job.commands";
import { SseService } from "../../../core/sse";
import type { Request, Response } from "express";

describe("MessageModule Full Coverage", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		MessageService.init();
	});

	it("MessageRepository - create, updateContent, findById", async () => {
		const mockMsg = {
			id: "m-1",
			conversation_id: "c-1",
			role: "USER" as const,
			content: "Bonjour",
			created_at: new Date(),
		};

		vi.spyOn(prisma.message, "create").mockResolvedValue(mockMsg as any);
		vi.spyOn(prisma.message, "update").mockResolvedValue({ ...mockMsg, content: "Mis à jour" } as any);
		vi.spyOn(prisma.message, "findUnique").mockResolvedValue(mockMsg as any);

		const created = await MessageRepository.create("c-1", "USER", "Bonjour", "m-1");
		expect(created.id).toBe("m-1");

		const updated = await MessageRepository.updateContent("m-1", "Mis à jour");
		expect(updated.content).toBe("Mis à jour");

		const found = await MessageRepository.findById("m-1");
		expect(found?.id).toBe("m-1");
	});

	it("MessageController - postMessage and cancelMessage", async () => {
		const controller = new MessageController();
		const mockUser = { id: "u-1", email: "user@test.com", client_id: "cl-1", role: "USER", dev: "false" };

		vi.spyOn(eventBus, "request").mockImplementation(async (cmd: any, input: any) => {
			if (cmd.name === MessageCommands.post.name) {
				return { job_id: "j-1", conversation_id: "c-1", stream_url: "/sse/v1/job/j-1" };
			}
			if (cmd.name === MessageCommands.cancel.name) {
				return { jobId: "j-1", status: "CANCELLED" };
			}
			return null;
		});

		const resJson = vi.fn();
		const resStatus = vi.fn().mockReturnValue({ json: resJson });
		const mockRes = { status: resStatus, json: resJson } as unknown as Response;

		const mockReqPost = {
			user: mockUser,
			validatedData: { body: { prompt: "Test prompt", conversation_id: "c-1" } },
		} as unknown as Request;

		await controller.postMessage(mockReqPost, mockRes);
		expect(resStatus).toHaveBeenCalledWith(201);

		const mockReqCancel = {
			user: mockUser,
			validatedData: { params: { id: "j-1" } },
		} as unknown as Request;

		await controller.cancelMessage(mockReqCancel, mockRes);
		expect(resStatus).toHaveBeenCalledWith(200);
	});

	it("MessageController - subscribeJobStream", async () => {
		const controller = new MessageController();
		const mockUser = { id: "u-1", email: "user@test.com", client_id: "cl-1", role: "USER", dev: "false" };

		vi.spyOn(eventBus, "request").mockImplementation(async (cmd: any) => {
			if (cmd.name === JobCommands.getById.name) {
				return { id: "j-1", status: "IN_PROGRESS" };
			}
			return null;
		});

		const mockRes = {
			writeHead: vi.fn(),
			write: vi.fn(),
			on: vi.fn(),
			flush: vi.fn(),
		} as unknown as Response;

		const mockReq = {
			user: mockUser,
			params: { jobId: "j-1" },
			headers: {},
			query: {},
		} as unknown as Request;

		vi.spyOn(SseService, "attachJobSession").mockResolvedValue();

		await controller.subscribeJobStream(mockReq, mockRes);
		expect(mockRes.writeHead).toHaveBeenCalled();
	});
});
