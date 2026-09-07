import { z } from "zod";
import { defineEvent } from "../../core/bus/bus.types";

export const ConversationEvents = {
	deleted: defineEvent(
		"conversation.deleted",
		z.object({
			conversationId: z.string(),
			userId: z.string(),
			dev: z.string(),
		}),
	),
};
