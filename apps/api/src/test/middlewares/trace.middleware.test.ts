import { beforeEach, describe, expect, it, vi } from "vitest";
import { CORRELATION_ID_HEADER, traceMiddleware } from "../../middlewares";
import type { Request, Response } from "express";
import { traceStorage } from "../../config/trace";

describe("Trace Middleware", () => {
	let req: any;
	let res: any;
	let next: any;

	beforeEach(() => {
		req = {
			headers: {},
			header: vi.fn((name: string) => req.headers[name.toLowerCase()]),
		};
		res = {
			setHeader: vi.fn(),
			on: vi.fn(),
		};
		next = vi.fn(() => {
			// Vérifie que le store AsyncLocalStorage est actif et correct pendant next()
			const store = traceStorage.getStore();
			expect(store).toBeDefined();
			expect(store?.correlationId).toBe(req.correlationId);
		});
	});

	it("should generate a new correlation ID if none exists", () => {
		traceMiddleware(req as Request, res as Response, next);

		expect(req.correlationId).toBeDefined();
		expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, req.correlationId);
		expect(next).toHaveBeenCalled();
	});

	it("should reuse existing correlation ID from headers", () => {
		const existingId = "existing-id-123";
		req.headers[CORRELATION_ID_HEADER.toLowerCase()] = existingId;

		traceMiddleware(req as Request, res as Response, next);

		expect(req.correlationId).toBe(existingId);
		expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, existingId);
		expect(next).toHaveBeenCalled();
	});
});
