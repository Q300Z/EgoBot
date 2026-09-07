import { z } from "zod";
import { defineCommand } from "../../core/bus/bus.types";
import { ModelEnum } from "../auth/auth.schema";
import { ConversationSchema, ConversationResponseSchema, ConversationsResponseSchema } from "./conversation.schema";

export const ConversationCommands = {
	list: defineCommand(
		"conversation.list",
		z.object({
			userId: z.string(),
			clientId: z.string(),
			model: ModelEnum,
		}),
		ConversationsResponseSchema,
	),
	getById: defineCommand(
		"conversation.get_by_id",
		z.object({
			id: z.string(),
			userId: z.string(),
		}),
		ConversationResponseSchema.nullable(),
	),
	deleteLogical: defineCommand(
		"conversation.delete_logical",
		z.object({
			id: z.string(),
			userId: z.string(),
			dev: z.string(),
		}),
		z.object({ success: z.boolean() }),
	),
	ensureExists: defineCommand(
		"conversation.ensure_exists",
		z.object({
			id: z.uuid(),
			userId: z.string(),
			clientId: z.string(),
			title: z.string(),
			model: ModelEnum,
		}),
		ConversationSchema,
	),
	cleanupOld: defineCommand(
		"conversation.cleanup_old",
		z.object({}).optional().default({}),
		z.object({ cleanedCount: z.number() }),
	),
};
