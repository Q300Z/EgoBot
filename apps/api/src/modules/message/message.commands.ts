import { z } from "zod";
import { defineCommand } from "../../core/bus/bus.types";
import { MessageResponseSchema } from "./message.schema";

export const MessageCommands = {
	post: defineCommand(
		"message.post",
		z.object({
			conversation_id: z.string().optional(),
			prompt: z.string().min(1),
			execute_at: z.string().optional(),
			userId: z.string(),
			userEmail: z.email(),
			userClientId: z.string(),
			correlationId: z.string().optional(),
		}),
		MessageResponseSchema,
	),
	cancel: defineCommand(
		"message.cancel",
		z.object({
			jobId: z.string(),
			dev: z.string(),
			correlationId: z.string().optional(),
		}),
		z.object({
			jobId: z.string(),
			status: z.literal("CANCELLED"),
		}),
	),
};
