import "express";
import type { UserPayload } from "./modules/auth";

declare global {
	namespace Express {
		interface Request {
			validatedData?: unknown;
			user: UserPayload;
			correlationId: string;
		}
	}
}
