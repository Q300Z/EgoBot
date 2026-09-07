import { describe, expect, it } from "vitest";
import {
	HttpError,
	UnauthorizedError,
	ForbiddenError,
	ValidationError,
	NotFoundError,
	BadRequestError,
} from "../../../core/errors";

describe("Custom HTTP Errors", () => {
	it("should create a base HttpError correctly", () => {
		const error = new HttpError(418, "I'm a teapot", { info: "extra" });
		expect(error.statusCode).toBe(418);
		expect(error.message).toBe("I'm a teapot");
		expect(error.details).toEqual({ info: "extra" });
		expect(error.name).toBe("HttpError");
		expect(error.stack).toBeDefined();
	});

	it("should create a base HttpError without captureStackTrace if disabled", () => {
		const originalCapture = Error.captureStackTrace;
		try {
			(Error as any).captureStackTrace = undefined;
			const error = new HttpError(500, "Internal error");
			expect(error.statusCode).toBe(500);
		} finally {
			Error.captureStackTrace = originalCapture;
		}
	});

	it("should create an UnauthorizedError (401)", () => {
		const error = new UnauthorizedError();
		expect(error.statusCode).toBe(401);
		expect(error.message).toBe("Non authentifié");

		const customError = new UnauthorizedError("Custom unauthorized message");
		expect(customError.message).toBe("Custom unauthorized message");
	});

	it("should create a ForbiddenError (403)", () => {
		const error = new ForbiddenError();
		expect(error.statusCode).toBe(403);
		expect(error.message).toBe("Accès interdit");

		const customError = new ForbiddenError("Custom forbidden message");
		expect(customError.message).toBe("Custom forbidden message");
	});

	it("should create a ValidationError (422) with issues", () => {
		const issues = [{ path: "email", message: "Invalid email", code: "custom" }];
		const error = new ValidationError(issues);
		expect(error.statusCode).toBe(422);
		expect(error.message).toBe("Erreur de validation");
		expect(error.issues).toEqual(issues);
		expect(error.details).toEqual(issues);
	});

	it("should create a NotFoundError (404)", () => {
		const error = new NotFoundError();
		expect(error.statusCode).toBe(404);
		expect(error.message).toBe("Ressource introuvable");

		const customError = new NotFoundError("Custom not found message");
		expect(customError.message).toBe("Custom not found message");
	});

	it("should create a BadRequestError (400)", () => {
		const error = new BadRequestError();
		expect(error.statusCode).toBe(400);
		expect(error.message).toBe("Requête invalide");

		const customError = new BadRequestError("Custom bad request message");
		expect(customError.message).toBe("Custom bad request message");
	});
});
