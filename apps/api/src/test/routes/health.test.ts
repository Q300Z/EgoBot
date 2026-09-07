import { describe, it, expect, vi, beforeEach } from "vitest";
import { healthCheckHandler } from "../../routes/health";
import { prisma } from "../../config/db";
import { valkeyReader } from "../../config/valkey";
import type { Request, Response } from "express";

describe("Health Check Route", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should return 200 and ok when database and valkey are healthy", async () => {
		vi.spyOn(prisma as any, "$queryRawUnsafe").mockResolvedValue([{ 1: 1 }]);
		vi.spyOn(valkeyReader, "ping").mockResolvedValue("PONG" as any);

		const resJson = vi.fn();
		const resStatus = vi.fn().mockReturnValue({ json: resJson });
		const mockRes = { status: resStatus, json: resJson } as unknown as Response;
		const mockReq = {} as Request;

		await healthCheckHandler(mockReq, mockRes);

		expect(resStatus).toHaveBeenCalledWith(200);
		expect(resJson).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "ok",
				checks: {
					database: "ok",
					valkey: "ok",
				},
			}),
		);
	});

	it("should return 503 and degraded/error when valkey or database fails", async () => {
		vi.spyOn(prisma as any, "$queryRawUnsafe").mockRejectedValue(new Error("DB connection timeout"));
		vi.spyOn(valkeyReader, "ping").mockResolvedValue("PONG" as any);

		const resJson = vi.fn();
		const resStatus = vi.fn().mockReturnValue({ json: resJson });
		const mockRes = { status: resStatus, json: resJson } as unknown as Response;
		const mockReq = {} as Request;

		await healthCheckHandler(mockReq, mockRes);

		expect(resStatus).toHaveBeenCalledWith(503);
		expect(resJson).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "error",
				checks: expect.objectContaining({
					database: "DB connection timeout",
					valkey: "ok",
				}),
			}),
		);
	});
});
