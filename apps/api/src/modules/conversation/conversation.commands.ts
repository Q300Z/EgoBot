import { z } from "zod";
import { defineCommand } from "../../core/bus/bus.types";
import { ModelEnum } from "../auth/auth.schema";
import { ConversationSchema, ConversationResponseSchema, ConversationsResponseSchema } from "./conversation.schema";

export const PaginatedConversationsResponseSchema = z.object({
	items: ConversationsResponseSchema,
	total: z.number(),
	page: z.number(),
	pageSize: z.number(),
	totalPages: z.number(),
});

export const ConversationCommands = {
	list: defineCommand(
		"conversation.list",
		z.object({
			userId: z.string(),
			clientId: z.string(),
			model: ModelEnum,
			page: z.number().optional(),
			pageSize: z.number().optional(),
			search: z.string().optional(),
		}),
		z.union([ConversationsResponseSchema, PaginatedConversationsResponseSchema]),
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
		z.object({ days: z.number().optional().default(15) }).optional().default({ days: 15 }),
		z.object({ cleanedCount: z.number() }),
	),
	purgeDeleted: defineCommand(
		"conversation.purge_deleted",
		z.object({ days: z.number().optional().default(180) }).optional().default({ days: 180 }),
		z.object({ purgedCount: z.number() }),
	),
};
