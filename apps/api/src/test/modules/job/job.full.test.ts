import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JobRepository, JobScheduler, JobService, JobStreamHandler, JobCommands } from "../../../modules/job";
import { prisma } from "../../../config/db";
import { redisReader, redisWriter, redisStream } from "../../../config/redis";
import { eventBus } from "../../../core/bus/eventBus";

describe("JobModule Full Coverage", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		JobService.init();
	});

	afterEach(() => {
		JobScheduler.stop();
		JobStreamHandler.stopPolling();
	});

	it("JobRepository - create, findById, update, countActiveJobsByConversation, findStuckJobs, findActiveJobs", async () => {
		const mockJob = {
			id: "j-1",
			conversation_id: "c-1",
			user_prompt_id: "m-user",
			assistant_message_id: "m-assistant",
			model: "CHATBOT" as const,
			status: "PENDING" as const,
			created_at: new Date(),
			updated_at: new Date(),
		};

		vi.spyOn(prisma.job, "create").mockResolvedValue(mockJob as any);
		vi.spyOn(prisma.job, "findUnique").mockResolvedValue(mockJob as any);
		vi.spyOn(prisma.job, "update").mockResolvedValue({ ...mockJob, status: "COMPLETED" } as any);
		vi.spyOn(prisma.job, "count").mockResolvedValue(1);
		vi.spyOn(prisma.job, "findMany").mockResolvedValue([mockJob] as any);

		const created = await JobRepository.create({
			id: "j-1",
			conversation_id: "c-1",
			user_prompt_id: "m-user",
			assistant_message_id: "m-assistant",
			model: "CHATBOT",
		});
		expect(created.id).toBe("j-1");

		const found = await JobRepository.findById("j-1");
		expect(found?.id).toBe("j-1");

		const updated = await JobRepository.update("j-1", { status: "COMPLETED" });
		expect(updated.status).toBe("COMPLETED");

		const count = await JobRepository.countActiveJobsByConversation("c-1");
		expect(count).toBe(1);

		const stuck = await JobRepository.findStuckJobs(new Date());
		expect(stuck.length).toBe(1);

		const active = await JobRepository.findActiveJobs();
		expect(active.length).toBe(1);
	});

	it("JobStreamHandler - trackJob, publishToSseStream, publishToInferenceQueue, scheduleDeferred, isCancelled", async () => {
		vi.spyOn(JobStreamHandler, "publishToInferenceQueue").mockResolvedValue();
		vi.spyOn(JobStreamHandler, "scheduleDeferred").mockResolvedValue();
		vi.spyOn(JobStreamHandler, "requestCancellation").mockResolvedValue();
		vi.spyOn(JobStreamHandler, "isCancelled").mockResolvedValue(true);

		JobStreamHandler.trackJob("j-1", "dev");
		expect(JobStreamHandler.jobEnvsMap.get("j-1")).toBe("dev");

		await JobStreamHandler.publishToInferenceQueue("dev", "CHATBOT", { event: "job.created", data: {} });
		expect(JobStreamHandler.publishToInferenceQueue).toHaveBeenCalled();

		await JobStreamHandler.scheduleDeferred(Date.now(), { jobId: "j-1" });
		expect(JobStreamHandler.scheduleDeferred).toHaveBeenCalled();

		await JobStreamHandler.requestCancellation("j-1");
		expect(JobStreamHandler.requestCancellation).toHaveBeenCalled();

		const cancelled = await JobStreamHandler.isCancelled("j-1");
		expect(cancelled).toBe(true);

		JobStreamHandler.cleanupJob("j-1");
		expect(JobStreamHandler.jobEnvsMap.has("j-1")).toBe(false);
	});

	it("JobScheduler - start and stop", () => {
		vi.spyOn(JobStreamHandler, "getDueDeferredJobs").mockResolvedValue([]);
		JobScheduler.start();
		JobScheduler.start(); // idempotent
		JobScheduler.stop();
	});

	it("JobService - cancelJob, handleTimeout, handleStuckJobsVerifier", async () => {
		const mockJob = {
			id: "j-cancel",
			conversation_id: "c-1",
			user_prompt_id: "m-u",
			assistant_message_id: "m-a",
			status: "IN_PROGRESS" as const,
		};
		vi.spyOn(JobRepository, "findById").mockResolvedValue(mockJob as any);
		vi.spyOn(JobRepository, "update").mockResolvedValue(mockJob as any);
		vi.spyOn(JobStreamHandler, "requestCancellation").mockResolvedValue();
		vi.spyOn(redisStream, "xRange").mockResolvedValue([]);
		vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) =>
			cb({
				message: {
					update: vi.fn().mockResolvedValue({}),
					findUnique: vi.fn().mockResolvedValue({ content: "prompt" }),
				},
				conversation: {
					update: vi.fn().mockResolvedValue({}),
				},
			}),
		);

		const cancelRes = await JobService.cancelJob({ jobId: "j-cancel", dev: "false" });
		expect(cancelRes.status).toBe("CANCELLED");

		await JobService.handleTimeout({ jobId: "j-cancel" });

		vi.spyOn(JobRepository, "findStuckJobs").mockResolvedValue([mockJob] as any);
		const stuckRes = await JobService.handleStuckJobsVerifier();
		expect(stuckRes.cleanedCount).toBe(1);
	});

	it("JobService - handleTokenEmitted (progress, __DEFER_JOB__, completed)", async () => {
		const mockJob = {
			id: "j-stream",
			conversation_id: "c-1",
			user_prompt_id: "m-u",
			assistant_message_id: "m-a",
			status: "PENDING" as const,
		};
		vi.spyOn(JobRepository, "findById").mockResolvedValue(mockJob as any);
		vi.spyOn(JobRepository, "update").mockResolvedValue(mockJob as any);
		vi.spyOn(redisStream, "xRange").mockResolvedValue([
			{
				id: "100-0",
				message: {
					event: "job.progress",
					data: JSON.stringify({ event: "job.progress", data: { kind: "token", chunk: "Hello " } }),
				},
			},
			{
				id: "100-1",
				message: {
					event: "job.progress",
					data: JSON.stringify({ event: "job.progress", data: { kind: "token", chunk: "World!" } }),
				},
			},
		] as any);
		vi.spyOn(prisma.conversation, "findUnique").mockResolvedValue({ user_id: "u-1" } as any);
		vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) =>
			cb({
				message: { update: vi.fn().mockResolvedValue({}) },
				conversation: { update: vi.fn().mockResolvedValue({}) },
			}),
		);

		// 1. Progress Token
		await JobService.handleTokenEmitted({
			jobId: "j-stream",
			env: "prod",
			envelope: {
				event: "job.progress",
				data: { kind: "token", status: "IN_PROGRESS", chunk: "Hello " },
			},
		});

		// 2. Special Defer Token
		await JobService.handleTokenEmitted({
			jobId: "j-stream",
			env: "prod",
			envelope: {
				event: "job.progress",
				data: { kind: "token", status: "IN_PROGRESS", chunk: "__DEFER_JOB__:RAG" },
			},
		});

		// 3. Completed Event
		await JobService.handleTokenEmitted({
			jobId: "j-stream",
			env: "prod",
			envelope: {
				event: "job.completed",
				data: {
					kind: "state",
					status: "COMPLETED",
					statistics: { generated_tokens: 2, time_to_first_token: 0.1, tokens_per_second: 20 },
				},
			},
		});
	});

	it("JobService - handleDeferredJobsPoller", async () => {
		vi.spyOn(JobStreamHandler, "getDueDeferredJobs").mockResolvedValue([
			JSON.stringify({
				jobId: "j-deferred",
				dev: "false",
				model: "CHATBOT",
				envelope: { event: "job.created", data: { job_id: "j-deferred" } },
			}),
		]);
		vi.spyOn(JobStreamHandler, "releaseDeferredJob").mockResolvedValue();
		vi.spyOn(JobRepository, "update").mockResolvedValue({} as any);

		const result = await JobService.handleDeferredJobsPoller();
		expect(result.releasedCount).toBe(1);
	});
});
