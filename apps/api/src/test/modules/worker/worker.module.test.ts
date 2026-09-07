import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	WorkerService,
	WorkerCommands,
	WorkerRepository,
	WorkerEvents,
	WorkerScheduler,
} from "../../../modules/worker";
import { eventBus } from "../../../core/bus/eventBus";

describe("WorkerModule (TDD)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		WorkerService.init();
	});

	afterEach(() => {
		WorkerScheduler.stop();
	});

	it("should compute online status when active workers > 0", async () => {
		vi.spyOn(WorkerRepository, "getActiveWorkersCount").mockResolvedValue(2);
		const listener = vi.fn();
		const unsub = eventBus.on(WorkerEvents.statusChanged, listener);

		const result = await eventBus.request(WorkerCommands.computeStatus, {});

		expect(result).toEqual({
			status: "online",
			active_workers: 2,
		});
		expect(listener).toHaveBeenCalledWith({
			status: "online",
			active_workers: 2,
		});
		unsub();
	});

	it("should compute offline status when active workers is 0", async () => {
		vi.spyOn(WorkerRepository, "getActiveWorkersCount").mockResolvedValue(0);

		const result = await eventBus.request(WorkerCommands.computeStatus, {});

		expect(result).toEqual({
			status: "offline",
			active_workers: 0,
		});
	});
});
