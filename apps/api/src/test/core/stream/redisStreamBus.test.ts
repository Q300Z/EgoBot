import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { RedisStreamBus } from "../../../core/stream/RedisStreamBus";
import { defineWorkerQueue, defineStreamEvent } from "../../../core/stream/stream.types";
import { redisWriter } from "../../../config/redis";
import { traceStorage } from "../../../config/trace";

describe("RedisStreamBus (TDD)", () => {
	let streamBus: RedisStreamBus;

	const testPayloadSchema = z
		.object({
			uid: z.string().min(1),
			callback: z.string().url(),
			data: z.string().optional(),
		})
		.passthrough();

	const testCompletedEvent = defineStreamEvent(
		"test.completed",
		z
			.object({
				uid: z.string(),
				result: z.string(),
			})
			.passthrough(),
	);

	const testQueue = defineWorkerQueue({
		workerType: "TEST_WORKER",
		pollIntervalMs: 5000,
		requestSchema: testPayloadSchema,
		terminalEvents: ["test.completed"],
	});

	beforeEach(() => {
		vi.clearAllMocks();
		streamBus = new RedisStreamBus();
	});

	afterEach(() => {
		streamBus.stop();
	});

	describe("publishRequest", () => {
		it("should validate payload, execute atomic multi pipeline on redisWriter and track entityId", async () => {
			const multiMock = {
				xAdd: vi.fn().mockReturnThis(),
				expire: vi.fn().mockReturnThis(),
				set: vi.fn().mockReturnThis(),
				exec: vi.fn().mockResolvedValue(["100-0", "1", "OK"]),
			};
			vi.spyOn(redisWriter, "multi").mockReturnValue(multiMock as any);

			const validData = {
				uid: "task-001",
				callback: "https://example.com/webhook",
				data: "sample payload",
			};

			await streamBus.publishRequest(testQueue, "task-001", validData, { env: "prod" });

			expect(multiMock.xAdd).toHaveBeenCalledWith(
				"jobs:queue:prod:TEST_WORKER",
				"*",
				expect.objectContaining({
					event: "test_worker.created",
					data: JSON.stringify(validData),
				}),
			);

			expect(multiMock.expire).toHaveBeenCalledWith("jobs:queue:prod:TEST_WORKER", 43_200);
			expect(multiMock.set).toHaveBeenCalledWith("job:env:task-001", "prod", { EX: 43_200 });
			expect(multiMock.exec).toHaveBeenCalled();

			// Entity is tracked in observer
			expect(streamBus.isTracking("task-001")).toBe(true);
		});

		it("should inject correlationId from traceStorage into published message", async () => {
			const multiMock = {
				xAdd: vi.fn().mockReturnThis(),
				expire: vi.fn().mockReturnThis(),
				set: vi.fn().mockReturnThis(),
				exec: vi.fn().mockResolvedValue(["100-0", "1", "OK"]),
			};
			vi.spyOn(redisWriter, "multi").mockReturnValue(multiMock as any);

			await traceStorage.run({ correlationId: "trace-xyz-123" }, async () => {
				await streamBus.publishRequest(
					testQueue,
					"task-002",
					{ uid: "task-002", callback: "https://example.com/cb" },
					{ env: "dev" },
				);
			});

			expect(multiMock.xAdd).toHaveBeenCalledWith(
				"jobs:queue:dev:TEST_WORKER",
				"*",
				expect.objectContaining({
					correlationId: "trace-xyz-123",
				}),
			);
		});

		it("should reject payload that violates requestSchema with ZodError", async () => {
			const invalidData = {
				uid: "", // invalid empty uid
				callback: "not-a-valid-url",
			};

			await expect(streamBus.publishRequest(testQueue, "task-invalid", invalidData as any)).rejects.toThrow();
		});
	});

	describe("Event Subscription (on)", () => {
		it("should register typed event listeners and trigger them with parsed payload", async () => {
			const handler = vi.fn();
			const unsubscribe = streamBus.on(testCompletedEvent, handler);

			// Simulate dispatch from StreamObserver
			await streamBus.dispatchStreamEvent(
				"jobs:sse:prod:task-001",
				{
					event: "test.completed",
					data: JSON.stringify({ uid: "task-001", result: "success" }),
				},
				"100-1",
			);

			expect(handler).toHaveBeenCalledWith({
				entityId: "task-001",
				payload: { uid: "task-001", result: "success" },
				rawMessageId: "100-1",
				streamKey: "jobs:sse:prod:task-001",
			});

			unsubscribe();
			await streamBus.dispatchStreamEvent(
				"jobs:sse:prod:task-001",
				{
					event: "test.completed",
					data: JSON.stringify({ uid: "task-001", result: "success-2" }),
				},
				"100-2",
			);
			expect(handler).toHaveBeenCalledTimes(1);
		});
	});
});
