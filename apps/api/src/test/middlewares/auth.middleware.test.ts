import { describe, it, expect, vi } from "vitest";
import { authenticateJWT, isAdmin } from "../../middlewares/auth.middleware";
import { UnauthorizedError, ForbiddenError } from "../../core/errors";
import { SignJWT } from "jose";
import { env } from "../../config/env";
import type { Request, Response, NextFunction } from "express";

describe("Auth Middleware", () => {
	const secret = new TextEncoder().encode(env.SECRET_KEY);

	it("should authenticate valid Bearer JWT token from header", async () => {
		const token = await new SignJWT({
			id: "user-1",
			email: "user@agelid.com",
			client_id: "client-1",
			role: "ADMIN",
			dev: "true",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(secret);

		const req = {
			headers: {
				authorization: `Bearer ${token}`,
				accept: "application/json",
			},
			method: "POST",
		} as unknown as Request;

		const res = {} as Response;
		const next = vi.fn() as unknown as NextFunction;

		await authenticateJWT(req, res, next);

		expect(next).toHaveBeenCalled();
		expect(req.user).toBeDefined();
		expect(req.user.id).toBe("user-1");
		expect(req.user.role).toBe("ADMIN");
	});

	it("should authenticate valid JWT from query param for SSE request", async () => {
		const token = await new SignJWT({
			id: "user-2",
			email: "client@test.com",
			client_id: "client-2",
			role: "USER",
			dev: "false",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(secret);

		const req = {
			headers: {
				accept: "text/event-stream",
			},
			method: "GET",
			query: { token },
		} as unknown as Request;

		const res = {} as Response;
		const next = vi.fn() as unknown as NextFunction;

		await authenticateJWT(req, res, next);

		expect(next).toHaveBeenCalled();
		expect(req.user.id).toBe("user-2");
		expect(req.user.role).toBe("USER");
	});

	it("should reject request with missing token", async () => {
		const req = {
			headers: {},
			method: "POST",
		} as unknown as Request;

		const res = {} as Response;
		const next = vi.fn() as unknown as NextFunction;

		await authenticateJWT(req, res, next);

		expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
	});

	it("should reject request with expired token", async () => {
		const expiredToken = await new SignJWT({
			id: "user-3",
			email: "user3@test.com",
			client_id: "client-3",
			role: "USER",
			dev: "false",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
			.setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
			.sign(secret);

		const req = {
			headers: {
				authorization: `Bearer ${expiredToken}`,
			},
			method: "POST",
		} as unknown as Request;

		const res = {} as Response;
		const next = vi.fn() as unknown as NextFunction;

		await authenticateJWT(req, res, next);

		expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
	});

	it("isAdmin - should allow ADMIN role", () => {
		const req = {
			user: {
				id: "admin-1",
				email: "admin@agelid.com",
				client_id: "c1",
				role: "ADMIN",
				dev: "true",
			},
		} as unknown as Request;
		const res = {} as Response;
		const next = vi.fn() as unknown as NextFunction;

		isAdmin(req, res, next);
		expect(next).toHaveBeenCalled();
	});

	it("isAdmin - should throw ForbiddenError for non-ADMIN user", () => {
		const req = {
			user: {
				id: "user-1",
				email: "user@test.com",
				client_id: "c1",
				role: "USER",
				dev: "false",
			},
		} as unknown as Request;
		const res = {} as Response;
		const next = vi.fn() as unknown as NextFunction;

		expect(() => isAdmin(req, res, next)).toThrow(ForbiddenError);
	});

	describe("authorisedIP Middleware", () => {
		it("should allow whitelisted IPv4 from req.ip", async () => {
			const { authorisedIP } = await import("../../middlewares/auth.middleware");
			const req = { ip: "149.202.77.84", headers: {} } as unknown as Request;
			const res = {} as Response;
			const next = vi.fn() as unknown as NextFunction;

			authorisedIP(req, res, next);
			expect(next).toHaveBeenCalled();
		});

		it("should allow localhost IPv6 (::1 and ::ffff:127.0.0.1)", async () => {
			const { authorisedIP } = await import("../../middlewares/auth.middleware");
			const next1 = vi.fn() as unknown as NextFunction;
			authorisedIP({ ip: "::1", headers: {} } as unknown as Request, {} as Response, next1);
			expect(next1).toHaveBeenCalled();

			const next2 = vi.fn() as unknown as NextFunction;
			authorisedIP({ ip: "::ffff:127.0.0.1", headers: {} } as unknown as Request, {} as Response, next2);
			expect(next2).toHaveBeenCalled();
		});

		it("should extract client IP from x-forwarded-for proxy list", async () => {
			const { authorisedIP } = await import("../../middlewares/auth.middleware");
			const req = {
				headers: { "x-forwarded-for": "149.202.77.84, 10.0.0.1" },
			} as unknown as Request;
			const res = {} as Response;
			const next = vi.fn() as unknown as NextFunction;

			authorisedIP(req, res, next);
			expect(next).toHaveBeenCalled();
		});

		it("should reject non-whitelisted IP with ForbiddenError", async () => {
			const { authorisedIP } = await import("../../middlewares/auth.middleware");
			const req = { ip: "198.51.100.42", headers: {} } as unknown as Request;
			const res = {} as Response;
			const next = vi.fn() as unknown as NextFunction;

			expect(() => authorisedIP(req, res, next)).toThrow(ForbiddenError);
			expect(next).not.toHaveBeenCalled();
		});
	});
});
