import { z } from "zod";
import { defineCommand } from "../../core/bus/bus.types";
import {
	LogipolConfigSchema,
	LoginRequestSchemaV1,
	LoginRequestSchemaV2,
	LoginResponseSchema,
	ClassicLoginSchema,
	RegisterBodySchema,
	UserProfileSchema,
} from "./auth.schema";

export const AuthCommands = {
	loginV1: defineCommand("auth.login_v1", LoginRequestSchemaV1.shape.body, LoginResponseSchema),
	loginV2: defineCommand("auth.login_v2", LoginRequestSchemaV2.shape.body, LoginResponseSchema),
	loginClassic: defineCommand("auth.login_classic", ClassicLoginSchema, LoginResponseSchema),
	register: defineCommand("auth.register", RegisterBodySchema, LoginResponseSchema),
	getMe: defineCommand("auth.get_me", z.object({ userId: z.string() }), UserProfileSchema),
	getUserConfig: defineCommand(
		"auth.get_user_config",
		z.object({ userId: z.string() }),
		LogipolConfigSchema.nullable(),
	),
	saveUserConfig: defineCommand(
		"auth.save_user_config",
		z.object({ userId: z.string(), config: LogipolConfigSchema }),
		z.object({ success: z.boolean() }),
	),
	deleteUserConfig: defineCommand(
		"auth.delete_user_config",
		z.object({ userId: z.string() }),
		z.object({ success: z.boolean() }),
	),
};
