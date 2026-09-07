import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSafeInterval } from "../../../core/scheduler/safeInterval";

describe("SafeInterval (TDD)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should execute task on interval", async () => {
		const task = vi.fn().mockResolvedValue(undefined);
		const handle = createSafeInterval(task, {
			name: "TestTask",
			intervalMs: 1000,
		});

		handle.start();
		expect(task).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1000);
		expect(task).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000);
		expect(task).toHaveBeenCalledTimes(2);

		handle.stop();
		await vi.advanceTimersByTimeAsync(1000);
		expect(task).toHaveBeenCalledTimes(2);
	});

	it("should execute immediately if runImmediately is true", async () => {
		const task = vi.fn().mockResolvedValue(undefined);
		const handle = createSafeInterval(task, {
			name: "ImmediateTask",
			intervalMs: 1000,
			runImmediately: true,
		});

		handle.start();
		expect(task).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000);
		expect(task).toHaveBeenCalledTimes(2);

		handle.stop();
	});

	it("should prevent overlapping executions (anti-chevauchement lock)", async () => {
		let resolveTask1: () => void;
		const task1Promise = new Promise<void>((r) => {
			resolveTask1 = r;
		});

		const task = vi
			.fn()
			.mockImplementationOnce(() => task1Promise)
			.mockResolvedValue(undefined);

		const handle = createSafeInterval(task, {
			name: "LongRunningTask",
			intervalMs: 1000,
			runImmediately: true,
		});

		handle.start();
		expect(task).toHaveBeenCalledTimes(1);
		expect(handle.isExecuting()).toBe(true);

		// Advance time while task 1 is still pending
		await vi.advanceTimersByTimeAsync(2000);
		// Task should NOT be called again while executing
		expect(task).toHaveBeenCalledTimes(1);

		// Resolve task 1
		resolveTask1!();
		await vi.advanceTimersByTimeAsync(1);
		expect(handle.isExecuting()).toBe(false);

		// Now after interval, task 2 should execute
		await vi.advanceTimersByTimeAsync(1000);
		expect(task).toHaveBeenCalledTimes(2);

		handle.stop();
	});

	it("should automatically catch errors and continue next cycle", async () => {
		const task = vi.fn().mockRejectedValueOnce(new Error("Database transient error")).mockResolvedValue(undefined);

		const handle = createSafeInterval(task, {
			name: "FailingTask",
			intervalMs: 1000,
			runImmediately: true,
		});

		// Should not throw unhandled rejection
		handle.start();
		await vi.advanceTimersByTimeAsync(1);
		expect(task).toHaveBeenCalledTimes(1);
		expect(handle.isExecuting()).toBe(false);

		// Next cycle should run normally
		await vi.advanceTimersByTimeAsync(1000);
		expect(task).toHaveBeenCalledTimes(2);

		handle.stop();
	});

	it("should invoke custom onError hook when error occurs", async () => {
		const customError = new Error("Specific failure");
		const task = vi.fn().mockRejectedValueOnce(customError);
		const onError = vi.fn().mockResolvedValue(undefined);

		const handle = createSafeInterval(task, {
			name: "HookTask",
			intervalMs: 1000,
			runImmediately: true,
			onError,
		});

		handle.start();
		await vi.advanceTimersByTimeAsync(1);

		expect(onError).toHaveBeenCalledWith(customError, "HookTask");
		handle.stop();
	});
});
