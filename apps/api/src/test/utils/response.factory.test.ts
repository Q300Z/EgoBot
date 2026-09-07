import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { ApiResponseFactory } from "../../utils";

const createMockResponse = () => {
	const res = {} as unknown as Response;
	res.status = vi.fn().mockReturnValue(res);
	res.json = vi.fn().mockReturnValue(res);
	res.send = vi.fn().mockReturnValue(res);
	return res;
};

describe("ApiResponseFactory", () => {
	it("should format success response correctly", () => {
		const res = createMockResponse();
		const data = { id: 1 };
		ApiResponseFactory.success(res, data, "Success message", 200);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			data,
			message: "Success message",
		});
	});

	it("should format created response correctly", () => {
		const res = createMockResponse();
		const data = { id: 2 };
		ApiResponseFactory.created(res, data);

		expect(res.status).toHaveBeenCalledWith(201);
		expect(res.json).toHaveBeenCalledWith({
			data,
			message: "Ressource créée avec succès.",
		});
	});

	it("should format accepted response correctly", () => {
		const res = createMockResponse();
		const data = { jobId: "123" };
		ApiResponseFactory.accepted(res, data);

		expect(res.status).toHaveBeenCalledWith(202);
		expect(res.json).toHaveBeenCalledWith({
			data,
			message: "Demande acceptée, traitement en cours.",
		});
	});

	it("should format noContent response correctly", () => {
		const res = createMockResponse();
		ApiResponseFactory.noContent(res);

		expect(res.status).toHaveBeenCalledWith(204);
		expect(res.send).toHaveBeenCalled();
	});

	it("should format badRequest response correctly", () => {
		const res = createMockResponse();
		ApiResponseFactory.badRequest(res, "Invalid request", { field: "name" });

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			error: "Invalid request",
			details: { field: "name" },
		});
	});

	it("should format unauthorized response correctly", () => {
		const res = createMockResponse();
		ApiResponseFactory.unauthorized(res);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({
			error: "Identification requise.",
		});
	});

	it("should format forbidden response correctly", () => {
		const res = createMockResponse();
		ApiResponseFactory.forbidden(res, "Access Denied");

		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.json).toHaveBeenCalledWith({
			error: "Access Denied",
		});
	});

	it("should format notFound response correctly", () => {
		const res = createMockResponse();
		ApiResponseFactory.notFound(res);

		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.json).toHaveBeenCalledWith({
			error: "La ressource demandée est introuvable.",
		});
	});

	it("should format conflict response correctly", () => {
		const res = createMockResponse();
		ApiResponseFactory.conflict(res, "Email already exists");

		expect(res.status).toHaveBeenCalledWith(409);
		expect(res.json).toHaveBeenCalledWith({
			error: "Email already exists",
		});
	});

	it("should format validationError response correctly", () => {
		const res = createMockResponse();
		const errors = [{ path: "email", message: "Invalid email" }];
		ApiResponseFactory.validationError(res, errors);

		expect(res.status).toHaveBeenCalledWith(422);
		expect(res.json).toHaveBeenCalledWith({
			error: "Erreur de validation des données.",
			details: { errors },
		});
	});

	it("should format internalServerError response correctly", () => {
		const res = createMockResponse();
		ApiResponseFactory.internalServerError(res, "Something went wrong", { trace: "stack" });

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			error: "Something went wrong",
			details: { trace: "stack" },
		});
	});

	it("should format paginated response correctly", () => {
		const res = createMockResponse();
		const data = [{ id: 1 }, { id: 2 }];
		const pagination = { page: 1, limit: 10, total: 20 };
		ApiResponseFactory.paginated(res, data, pagination);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			message: "2 élément(s) trouvé(s).",
			data,
			pagination: {
				page: 1,
				limit: 10,
				total: 20,
				pages: 2,
			},
		});
	});

	describe("handleError", () => {
		it("should delegate to next callback if provided", () => {
			const res = createMockResponse();
			const next = vi.fn();
			const error = new Error("Some error");

			ApiResponseFactory.handleError(res, error, next);

			expect(next).toHaveBeenCalledWith(error);
			expect(res.status).not.toHaveBeenCalled();
		});

		it("should handle ValidationError or object with issues", () => {
			const res = createMockResponse();
			const error = {
				issues: [{ path: "username", message: "Required" }],
			};

			ApiResponseFactory.handleError(res, error);

			expect(res.status).toHaveBeenCalledWith(422);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: "Erreur de validation des données.",
				}),
			);
		});

		it("should handle constructor named ValidationError", () => {
			const res = createMockResponse();
			class ValidationError {
				constructor(public details: any) {}
			}
			const error = new ValidationError([{ path: "field", message: "invalid" }]);

			ApiResponseFactory.handleError(res, error);

			expect(res.status).toHaveBeenCalledWith(422);
		});

		it("should handle 401 Unauthorized errors", () => {
			const res = createMockResponse();
			const error = { statusCode: 401, message: "Custom Unauthorized" };

			ApiResponseFactory.handleError(res, error);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({
				error: "Custom Unauthorized",
			});
		});

		it("should handle 403 Forbidden errors", () => {
			const res = createMockResponse();
			const error = { statusCode: 403, message: "Custom Forbidden" };

			ApiResponseFactory.handleError(res, error);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({
				error: "Custom Forbidden",
			});
		});

		it("should handle 404 Not Found errors", () => {
			const res = createMockResponse();
			const error = { statusCode: 404, message: "Custom Not Found" };

			ApiResponseFactory.handleError(res, error);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({
				error: "Custom Not Found",
			});
		});

		it("should handle 400 Bad Request errors with details", () => {
			const res = createMockResponse();
			const error = { statusCode: 400, message: "Custom Bad Request", details: "some-details" };

			ApiResponseFactory.handleError(res, error);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				error: "Custom Bad Request",
				details: "some-details",
			});
		});

		it("should handle 400 Bad Request errors without details", () => {
			const res = createMockResponse();
			const error = { statusCode: 400, message: "Custom Bad Request" };

			ApiResponseFactory.handleError(res, error);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				error: "Custom Bad Request",
			});
		});

		it("should handle other HTTP status codes", () => {
			const res = createMockResponse();
			const error = { statusCode: 409, message: "Custom Conflict", details: { code: "duplicate" } };

			ApiResponseFactory.handleError(res, error);

			expect(res.status).toHaveBeenCalledWith(409);
			expect(res.json).toHaveBeenCalledWith({
				error: "Custom Conflict",
				details: { code: "duplicate" },
			});
		});

		it("should fallback to default internal server error message if provided", () => {
			const res = createMockResponse();
			const error = new Error("Database connection failed");

			ApiResponseFactory.handleError(res, error, undefined, "Erreur de connexion");

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({
				error: "Erreur de connexion",
			});
		});

		it("should output general internal server error with string error details", () => {
			const res = createMockResponse();

			ApiResponseFactory.handleError(res, "raw string error");

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({
				error: "Erreur interne",
				details: "raw string error",
			});
		});
	});
});
