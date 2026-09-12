import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageService, MessageCommands, initMessageModule } from "../../../modules/message";
import { AuthCommands } from "../../../modules/auth";
import { JobCommands } from "../../../modules/job";
import { eventBus } from "../../../core/bus/eventBus";

describe("MessageModule (TDD)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		eventBus.reset();
		(MessageService as any).initialized = false;
		initMessageModule();
	});

	it("should post message and request job creation via EventBus", async () => {
		// Mock Auth command response
		eventBus.registerHandler(AuthCommands.getUserConfig, async () => ({
			url: "http://Egobot",
			model: "CHATBOT" as const,
			email: "user@test.com",
			user: "user-1",
			client: "client-1",
			db_key: "db-1",
			dev: "false",
		}));

		// Mock Job command response
		eventBus.registerHandler(JobCommands.create, async (input) => ({
			jobId: input.jobId,
			conversationId: input.conversationId,
		}));

		const result = await eventBus.request(MessageCommands.post, {
			prompt: "Test message",
			userId: "user-1",
			userEmail: "user@test.com",
			userClientId: "client-1",
		});

		expect(result.job_id).toBeDefined();
		expect(result.conversation_id).toBeDefined();
		expect(result.stream_url).toBe(`/sse/v1/job/${result.job_id}`);
	});

	it("should reject post message if user session is not in redis (unauthorized)", async () => {
		eventBus.registerHandler(AuthCommands.getUserConfig, async () => null);

		await expect(
			eventBus.request(MessageCommands.post, {
				prompt: "Test message",
				userId: "user-unknown",
				userEmail: "unknown@test.com",
				userClientId: "client-1",
			}),
		).rejects.toThrow("Session Egobot expirée");
	});
});
