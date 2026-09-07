import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	JobService,
	JobCommands,
	JobRepository,
	JobStreamHandler,
	JobScheduler,
	initJobModule,
	stopJobModule,
} from "../../../modules/job";
import { eventBus } from "../../../core/bus/eventBus";
import { prisma } from "../../../config/db";

describe("JobModule (TDD)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		initJobModule();
	});

	afterEach(() => {
		stopJobModule();
	});

	it("should create a job and publish it to redis queue via JobStreamHandler", async () => {
		vi.spyOn(JobRepository, "countActiveJobsByConversation").mockResolvedValue(0);

		vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
			const mockTx = {
				conversation: {
					findUnique: vi.fn().mockResolvedValue(null),
					create: vi.fn().mockResolvedValue({ id: "conv-1", messages: [] }),
				},
				message: {
					create: vi.fn().mockResolvedValue({ id: "msg-1" }),
				},
			};
			return cb(mockTx);
		});

		vi.spyOn(JobRepository, "create").mockImplementation(async (data: any) => ({
			id: data.id,
			conversation_id: data.conversation_id,
			user_prompt_id: data.user_prompt_id,
			assistant_message_id: data.assistant_message_id,
			model: data.model,
			status: data.status || "PENDING",
			created_at: new Date(),
			updated_at: new Date(),
			started_at: null,
			ended_at: null,
			error: null,
			generated_tokens: null,
			time_to_first_token: null,
			tokens_per_second: null,
		}));

		const publishQueueSpy = vi.spyOn(JobStreamHandler, "publishToInferenceQueue").mockResolvedValue();
		const publishSseSpy = vi.spyOn(JobStreamHandler, "publishToSseStream").mockResolvedValue();

		const payload = {
			jobId: "11111111-1111-4111-8111-111111111111",
			conversationId: "22222222-2222-4222-8222-222222222222",
			userId: "user-1",
			userEmail: "test@example.com",
			userClientId: "client-1",
			prompt: "Bonjour !",
			logipolConfig: {
				url: "http://logipol",
				model: "CHATBOT" as const,
				email: "test@example.com",
				user: "user-1",
				client: "client-1",
				db_key: "db-1",
				dev: "false",
			},
		};

		const result = await eventBus.request(JobCommands.create, payload);

		expect(result.jobId).toBe("11111111-1111-4111-8111-111111111111");
		expect(publishSseSpy).toHaveBeenCalled();
		expect(publishQueueSpy).toHaveBeenCalled();
	});

	it("should cancel a job and update status", async () => {
		vi.spyOn(JobRepository, "findById").mockResolvedValue({
			id: "11111111-1111-4111-8111-111111111111",
			conversation_id: "conv-1",
			user_prompt_id: "p-1",
			assistant_message_id: "a-1",
			status: "IN_PROGRESS",
			model: "CHATBOT",
			created_at: new Date(),
			updated_at: new Date(),
			started_at: null,
			ended_at: null,
			error: null,
			generated_tokens: null,
			time_to_first_token: null,
			tokens_per_second: null,
		});

		vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
			const mockTx = {
				message: { update: vi.fn() },
			};
			return cb(mockTx);
		});
		vi.spyOn(JobRepository, "update").mockResolvedValue({} as any);
		vi.spyOn(JobStreamHandler, "requestCancellation").mockResolvedValue();

		const result = await eventBus.request(JobCommands.cancel, {
			jobId: "11111111-1111-4111-8111-111111111111",
			dev: "false",
		});

		expect(result).toEqual({
			jobId: "11111111-1111-4111-8111-111111111111",
			status: "CANCELLED",
		});
	});
});
