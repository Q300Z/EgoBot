import { describe, it, expect, vi } from "vitest";
import { validate, getValidatedData } from "../../middlewares/validation.middleware";
import { ValidationError } from "../../core/errors";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

describe("Validation Middleware", () => {
	const testSchema = z.object({
		body: z.object({
			name: z.string().min(3),
			age: z.number().optional(),
		}),
		params: z
			.object({
				id: z.uuid().optional(),
			})
			.optional(),
		query: z
			.object({
				page: z.string().optional(),
			})
			.optional(),
	});

	it("should validate valid request and attach data to req.validatedData", () => {
		const req = {
			body: { name: "Thomas", age: 30 },
			params: {},
			query: { page: "1" },
		} as unknown as Request;
		const res = {} as Response;
		const next = vi.fn() as unknown as NextFunction;

		const middleware = validate(testSchema);
		middleware(req, res, next);

		expect(next).toHaveBeenCalled();
		const validated = getValidatedData<z.infer<typeof testSchema>>(req);
		expect(validated.body.name).toBe("Thomas");
	});

	it("should throw ValidationError when input fails schema", () => {
		const req = {
			body: { name: "ab" }, // too short
			params: {},
			query: {},
		} as unknown as Request;
		const res = {} as Response;
		const next = vi.fn() as unknown as NextFunction;

		const middleware = validate(testSchema);
		expect(() => middleware(req, res, next)).toThrow(ValidationError);
	});
});
