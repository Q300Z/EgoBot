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
			EgobotConfig: {
				url: "http://Egobot",
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
				message: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue({ content: "" }) },
			};
			return cb(mockTx);
		});
		vi.spyOn(JobRepository, "update").mockResolvedValue({} as any);
		vi.spyOn(JobStreamHandler, "requestCancellation").mockResolvedValue();
		vi.spyOn(JobStreamHandler, "cleanupJob").mockImplementation(() => {});
		vi.spyOn(JobStreamHandler, "publishToSseStream").mockResolvedValue();

		const result = await eventBus.request(JobCommands.cancel, {
			jobId: "11111111-1111-4111-8111-111111111111",
			dev: "false",
		});

		expect(result).toEqual({
			jobId: "11111111-1111-4111-8111-111111111111",
			status: "CANCELLED",
		});
		expect(JobStreamHandler.cleanupJob).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
	});

	it("should cancel DEFERRED jobs and remove from Redis deferred set", async () => {
		vi.spyOn(JobRepository, "findById").mockResolvedValue({
			id: "deferred-job-1",
			conversation_id: "conv-1",
			user_prompt_id: "p-1",
			assistant_message_id: "a-1",
			status: "DEFERRED",
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
				message: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
			};
			return cb(mockTx);
		});
		vi.spyOn(JobRepository, "update").mockResolvedValue({} as any);
		vi.spyOn(JobStreamHandler, "requestCancellation").mockResolvedValue();
		const removeDeferredSpy = vi.spyOn(JobStreamHandler, "removeDeferredJob").mockResolvedValue();
		const cleanupJobSpy = vi.spyOn(JobStreamHandler, "cleanupJob").mockImplementation(() => {});
		vi.spyOn(JobStreamHandler, "publishToSseStream").mockResolvedValue();

		const result = await eventBus.request(JobCommands.cancel, {
			jobId: "deferred-job-1",
		});

		expect(result.status).toBe("CANCELLED");
		expect(removeDeferredSpy).toHaveBeenCalledWith("deferred-job-1");
		expect(cleanupJobSpy).toHaveBeenCalledWith("deferred-job-1");
	});

	it("should handle ConversationEvents.deleted by cancelling jobs and closing sessions", async () => {
		const { ConversationEvents } = await import("../../../modules/conversation/conversation.events");
		const { SseService } = await import("../../../core/sse");

		vi.spyOn(prisma.job, "findMany").mockResolvedValue([
			{ id: "active-job-1" },
			{ id: "deferred-job-2" },
		] as any);

		const cancelSpy = vi.spyOn(JobService, "cancelJob").mockResolvedValue({ jobId: "any", status: "CANCELLED" });
		const deleteStreamSpy = vi.spyOn(JobStreamHandler, "deleteSseStream").mockResolvedValue();
		const cleanupSpy = vi.spyOn(JobStreamHandler, "cleanupJob").mockImplementation(() => {});
		const closeConvSessionsSpy = vi.spyOn(SseService, "closeConversationSessions").mockImplementation(() => {});

		eventBus.emit(ConversationEvents.deleted, {
			conversationId: "conv-deleted-999",
			userId: "user-1",
		});

		// Attendre le traitement asynchrone de l'événement
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(cancelSpy).toHaveBeenCalledWith(expect.objectContaining({ jobId: "active-job-1" }));
		expect(cancelSpy).toHaveBeenCalledWith(expect.objectContaining({ jobId: "deferred-job-2" }));
		expect(deleteStreamSpy).toHaveBeenCalledWith("prod", "active-job-1");
		expect(deleteStreamSpy).toHaveBeenCalledWith("dev", "active-job-1");
		expect(cleanupSpy).toHaveBeenCalledWith("active-job-1");
		expect(closeConvSessionsSpy).toHaveBeenCalledWith("conv-deleted-999", "Discussion supprimée");
	});

	it("should handle worker inactivity timeout by marking job FAILED and notifying SSE", async () => {
		const { JobEvents } = await import("../../../modules/job/job.events");
		const { SseService } = await import("../../../core/sse");

		vi.spyOn(JobRepository, "findById").mockResolvedValue({
			id: "job-timeout-1",
			conversation_id: "conv-1",
			assistant_message_id: "a-1",
			status: "IN_PROGRESS",
		} as any);

		const updateMsgMock = vi.fn();
		vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
			const mockTx = {
				message: { update: updateMsgMock, findUnique: vi.fn().mockResolvedValue({ content: "Partial" }) },
			};
			return cb(mockTx);
		});
		const updateJobSpy = vi.spyOn(JobRepository, "update").mockResolvedValue({} as any);
		const cleanupJobSpy = vi.spyOn(JobStreamHandler, "cleanupJob").mockImplementation(() => {});
		const closeJobSessionsSpy = vi.spyOn(SseService, "closeJobSessions").mockImplementation(() => {});

		await JobService.handleTimeout({ jobId: "job-timeout-1" });

		expect(updateJobSpy).toHaveBeenCalledWith(
			"job-timeout-1",
			expect.objectContaining({ status: "FAILED" }),
			expect.anything(),
		);
		expect(updateMsgMock).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "a-1" },
				data: { content: "Partial\n<error>" },
			}),
		);
		expect(closeJobSessionsSpy).toHaveBeenCalledWith("job-timeout-1", "Délai d'attente dépassé");
		expect(cleanupJobSpy).toHaveBeenCalledWith("job-timeout-1");
	});
});
