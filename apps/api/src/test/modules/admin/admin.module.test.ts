import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminService, AdminCommands, AdminRepository, initAdminModule } from "../../../modules/admin";
import { eventBus } from "../../../core/bus/eventBus";

describe("AdminModule (TDD)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		eventBus.reset();
		(AdminService as any).initialized = false;
		initAdminModule();
	});

	it("should list conversations with pagination via command", async () => {
		const mockResponse = {
			conversations: [
				{
					id: "conv-1",
					user_id: "user-1",
					client_id: "client-1",
					title: "Discussion Admin",
					model: "CHATBOT",
					created_at: new Date(),
					updated_at: new Date(),
					last_message_at: new Date(),
				},
			],
			pagination: {
				total: 1,
				page: 1,
				limit: 20,
				totalPages: 1,
				hasNextPage: false,
			},
		};

		vi.spyOn(AdminRepository, "findManyAdmin").mockResolvedValue(mockResponse as any);

		const result = await eventBus.request(AdminCommands.listConversations, {});

		expect(result.conversations).toHaveLength(1);
		expect(result.pagination.total).toBe(1);
	});

	it("should get conversation details and compute stats correctly", async () => {
		const mockDetails = {
			id: "conv-1",
			user_id: "user-1",
			client_id: "client-1",
			title: "Discussion Admin",
			model: "CHATBOT",
			created_at: new Date("2026-01-01T00:00:00.000Z"),
			updated_at: new Date("2026-01-01T00:01:00.000Z"),
			deleted_at: null,
			messages: [],
			jobs: [
				{
					id: "job-1",
					status: "COMPLETED",
					model: "CHATBOT",
					created_at: new Date("2026-01-01T00:00:00.000Z"),
					started_at: new Date("2026-01-01T00:00:01.000Z"),
					ended_at: new Date("2026-01-01T00:00:03.000Z"),
					time_to_first_token: 0.25,
					tokens_per_second: 50.0,
					generated_tokens: 100,
					error: null,
					user_prompt: { content: "Question" },
					assistant_message: { content: "Réponse" },
				},
			],
		};

		vi.spyOn(AdminRepository, "findByIdAdmin").mockResolvedValue(mockDetails as any);

		const result = await eventBus.request(AdminCommands.getConversationDetails, { id: "conv-1" });

		expect(result.conversation.id).toBe("conv-1");
		expect(result.stats.totalJobs).toBe(1);
		expect(result.stats.avg_time_to_first_token).toBe(0.25);
		expect(result.stats.avg_tokens_per_second).toBe(50.0);
		expect(result.stats.avg_generated_tokens).toBe(100);
		expect(result.stats.avg_duration_ms).toBe(2000);
	});
});
