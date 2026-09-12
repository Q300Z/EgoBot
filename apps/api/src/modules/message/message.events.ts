import { z } from "zod";
import { defineEvent } from "../../core/bus/bus.types";

export const MessageEvents = {
	created: defineEvent(
		"message.created",
		z.object({
			messageId: z.string(),
			conversationId: z.string(),
			role: z.enum(["USER", "ASSISTANT"]),
		}),
	),
};
