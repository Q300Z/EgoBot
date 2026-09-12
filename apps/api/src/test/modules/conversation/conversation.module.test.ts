import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	ConversationService,
	ConversationCommands,
	ConversationRepository,
	initConversationModule,
	ConversationEvents,
} from "../../../modules/conversation";
import { eventBus } from "../../../core/bus/eventBus";

describe("ConversationModule (TDD)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		initConversationModule();
	});

	it("should list conversations for user via command", async () => {
		const mockConvs = [
			{
				id: "conv-1",
				title: "Discussion 1",
				user_id: "user-1",
				client_id: "client-1",
				model: "CHATBOT" as const,
				created_at: new Date(),
				updated_at: new Date(),
			},
		];

		vi.spyOn(ConversationRepository, "findMany").mockResolvedValue(mockConvs as any);

		const result = await eventBus.request(ConversationCommands.list, {
			userId: "user-1",
			clientId: "client-1",
			model: "CHATBOT",
		});

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("conv-1");
	});

	it("should get conversation by id via command", async () => {
		const mockConv = {
			id: "conv-1",
			title: "Discussion 1",
			user_id: "user-1",
			client_id: "client-1",
			model: "CHATBOT" as const,
			created_at: new Date(),
			updated_at: new Date(),
			messages: [],
		};

		vi.spyOn(ConversationRepository, "findById").mockResolvedValue(mockConv as any);

		const result = await eventBus.request(ConversationCommands.getById, {
			id: "conv-1",
			userId: "user-1",
		});

		expect(result?.id).toBe("conv-1");
	});

	it("should delete conversation logically and emit conversation.deleted event", async () => {
		vi.spyOn(ConversationRepository, "deleteLogical").mockResolvedValue(true);

		const listener = vi.fn();
		const unsub = eventBus.on(ConversationEvents.deleted, listener);

		const res = await eventBus.request(ConversationCommands.deleteLogical, {
			id: "conv-1",
			userId: "user-1",
		});

		expect(res).toEqual({ success: true });
		expect(listener).toHaveBeenCalledWith({
			conversationId: "conv-1",
			userId: "user-1",
		});
		unsub();
	});
});
