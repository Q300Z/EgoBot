import { z } from "zod";
import { defineEvent } from "../../core/bus/bus.types";

export const AuthEvents = {
	userLoggedIn: defineEvent(
		"auth.user_logged_in",
		z.object({
			userId: z.string(),
			email: z.string(),
			version: z.enum(["v1", "v2", "classic"]).or(z.string()),
		}),
	),
};
