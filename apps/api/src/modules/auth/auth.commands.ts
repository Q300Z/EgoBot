import { z } from "zod";
import { defineCommand } from "../../core/bus/bus.types";
import {
	EgobotConfigSchema,
	LoginResponseSchema,
	ClassicLoginSchema,
	RegisterBodySchema,
	UserProfileSchema,
} from "./auth.schema";

export const AuthCommands = {
	loginClassic: defineCommand("auth.login_classic", ClassicLoginSchema, LoginResponseSchema),
	register: defineCommand("auth.register", RegisterBodySchema, LoginResponseSchema),
	getMe: defineCommand("auth.get_me", z.object({ userId: z.string() }), UserProfileSchema),
	getUserConfig: defineCommand(
		"auth.get_user_config",
		z.object({ userId: z.string() }),
		EgobotConfigSchema.nullable(),
	),
	saveUserConfig: defineCommand(
		"auth.save_user_config",
		z.object({ userId: z.string(), config: EgobotConfigSchema }),
		z.object({ success: z.boolean() }),
	),
	deleteUserConfig: defineCommand(
		"auth.delete_user_config",
		z.object({ userId: z.string() }),
		z.object({ success: z.boolean() }),
	),
};
