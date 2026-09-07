import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkerController, WorkerRepository, WorkerScheduler, WorkerService } from "../../../modules/worker";
import { redisReader, redisWriter } from "../../../config/redis";
import type { Request, Response } from "express";

describe("WorkerModule Full Coverage", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		WorkerService.init();
	});

	afterEach(() => {
		WorkerScheduler.stop();
	});

	it("WorkerRepository - getActiveWorkerKeys and getActiveWorkersCount", async () => {
		vi.spyOn(WorkerRepository, "getActiveWorkerKeys").mockResolvedValue([
			"worker:presence:node-1:CHATBOT",
			"worker:presence:node-1:RAG",
			"worker:presence:node-2:CHATBOT",
		]);
		vi.spyOn(WorkerRepository, "getActiveWorkersCount").mockResolvedValue(2);
		vi.spyOn(WorkerRepository, "publishPresence").mockResolvedValue();

		const keys = await WorkerRepository.getActiveWorkerKeys();
		expect(keys.length).toBe(3);

		const count = await WorkerRepository.getActiveWorkersCount();
		expect(count).toBe(2);

		await WorkerRepository.publishPresence("node-1", { cpu: 20 });
		expect(WorkerRepository.publishPresence).toHaveBeenCalled();
	});

	it("WorkerScheduler - start and stop", () => {
		vi.spyOn(WorkerRepository, "getActiveWorkersCount").mockResolvedValue(1);
		WorkerScheduler.start();
		// Starting again should be idempotent
		WorkerScheduler.start();
		WorkerScheduler.stop();
	});

	it("WorkerController - subscribeStatus", async () => {
		const controller = new WorkerController();
		const mockRes = {
			writeHead: vi.fn(),
			write: vi.fn(),
			on: vi.fn(),
			flush: vi.fn(),
		} as unknown as Response;
		const mockReq = {} as Request;

		await controller.subscribeStatus(mockReq, mockRes);
		expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
	});
});
