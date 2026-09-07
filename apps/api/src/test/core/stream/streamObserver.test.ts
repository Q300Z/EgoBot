import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StreamObserver } from "../../../core/stream/StreamObserver";
import { redisStream } from "../../../config/redis";

describe("StreamObserver (TDD)", () => {
	let observer: StreamObserver;

	beforeEach(() => {
		vi.clearAllMocks();
		observer = new StreamObserver();
	});

	afterEach(() => {
		observer.stop();
	});

	describe("Tracking & Chunking", () => {
		it("should chunk 120 streams into batches of 50 during pollCycle", async () => {
			// Track 120 streams
			for (let i = 1; i <= 120; i++) {
				observer.trackStream({
					streamKey: `jobs:sse:prod:task-${i}`,
					entityId: `task-${i}`,
					pollIntervalMs: 5000,
					terminalEvents: ["task.completed"],
				});
			}

			const xReadSpy = vi.spyOn(redisStream, "xRead").mockResolvedValue([]);

			await observer.pollDueStreams();

			// 120 streams chunked by 50 = 3 calls (50 + 50 + 20)
			expect(xReadSpy).toHaveBeenCalledTimes(3);
			expect(xReadSpy.mock.calls[0][0]).toHaveLength(50);
			expect(xReadSpy.mock.calls[1][0]).toHaveLength(50);
			expect(xReadSpy.mock.calls[2][0]).toHaveLength(20);
		});

		it("should respect exact custom pollIntervalMs per stream", async () => {
			const xReadSpy = vi.spyOn(redisStream, "xRead").mockResolvedValue([]);

			observer.trackStream({
				streamKey: "jobs:sse:prod:stream-fast",
				entityId: "fast",
				pollIntervalMs: 100,
			});

			observer.trackStream({
				streamKey: "jobs:sse:prod:stream-slow",
				entityId: "slow",
				pollIntervalMs: 10_000,
			});

			// 1. First tick -> both streams are due (lastPolledAt = 0)
			await observer.pollDueStreams();
			expect(xReadSpy).toHaveBeenCalledTimes(1);
			expect(xReadSpy.mock.calls[0][0]).toHaveLength(2);

			xReadSpy.mockClear();

			// 2. Advance time by 200ms -> only stream-fast is due (100ms passed, but not 10_000ms)
			vi.spyOn(Date, "now").mockReturnValue(Date.now() + 200);
			await observer.pollDueStreams();

			expect(xReadSpy).toHaveBeenCalledTimes(1);
			expect(xReadSpy.mock.calls[0][0]).toHaveLength(1);
			expect(xReadSpy.mock.calls[0][0][0].key).toBe("jobs:sse:prod:stream-fast");
		});
	});

	describe("Anti-Poison-Pill Resilience", () => {
		it("should isolate corrupted JSON message, advance lastId and continue processing next messages", async () => {
			observer.trackStream({
				streamKey: "jobs:sse:prod:task-corrupt",
				entityId: "task-corrupt",
				pollIntervalMs: 5000,
				terminalEvents: ["task.completed"],
			});

			// Mock xRead returning 1 invalid message followed by 1 valid message
			vi.spyOn(redisStream, "xRead").mockResolvedValueOnce([
				{
					name: "jobs:sse:prod:task-corrupt",
					messages: [
						{
							id: "100-1",
							message: { event: "task.corrupt", data: "{ invalid json string..." },
						},
						{
							id: "100-2",
							message: { event: "task.completed", data: JSON.stringify({ uid: "task-corrupt", status: "OK" }) },
						},
					],
				},
			]);

			const onEventMock = vi.fn();
			observer.onEvent(onEventMock);

			await observer.pollDueStreams();

			// Valid message was processed despite the first one being corrupted
			expect(onEventMock).toHaveBeenCalledWith(
				"jobs:sse:prod:task-corrupt",
				expect.objectContaining({ event: "task.completed" }),
				"100-2",
			);

			// Stream was removed because task.completed is terminal
			expect(observer.isTracking("jobs:sse:prod:task-corrupt")).toBe(false);
		});
	});

	describe("Terminal Event & Auto-Cleanup", () => {
		it("should remove stream from observer immediately when terminal event is encountered", async () => {
			observer.trackStream({
				streamKey: "jobs:sse:prod:task-01",
				entityId: "task-01",
				pollIntervalMs: 5000,
				terminalEvents: ["task.completed", "task.failed"],
			});

			expect(observer.isTracking("jobs:sse:prod:task-01")).toBe(true);

			vi.spyOn(redisStream, "xRead").mockResolvedValueOnce([
				{
					name: "jobs:sse:prod:task-01",
					messages: [
						{
							id: "100-1",
							message: { event: "task.completed", data: JSON.stringify({ uid: "task-01" }) },
						},
					],
				},
			]);

			await observer.pollDueStreams();

			expect(observer.isTracking("jobs:sse:prod:task-01")).toBe(false);
		});
	});

	describe("Inactivity & Timeout Management", () => {
		it("should prune inactive streams exceeding timeout threshold", async () => {
			const timeoutHandler = vi.fn();
			observer.onTimeout(timeoutHandler);

			observer.trackStream({
				streamKey: "jobs:sse:prod:task-timeout",
				entityId: "task-timeout",
				pollIntervalMs: 5000,
				terminalEvents: ["task.completed"],
				timeoutMs: 1000, // 1 second timeout
			});

			// Advance time past timeout
			vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);

			observer.pruneExpiredStreams();

			expect(timeoutHandler).toHaveBeenCalledWith("task-timeout", "jobs:sse:prod:task-timeout");
			expect(observer.isTracking("jobs:sse:prod:task-timeout")).toBe(false);
		});
	});
});
