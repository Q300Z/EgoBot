import { z } from "zod";
import { ModelEnum } from "../auth/auth.schema";

export const GetConversationSchema = z.object({
	params: z.object({
		id: z.string().trim().min(1, { message: "L'identifiant de la conversation ne peut pas être vide" }),
	}),
});

export const ConversationSchema = z.object({
	id: z.string(),
	title: z.string(),
	user_id: z.string(),
	client_id: z.string(),
	model: ModelEnum,
	created_at: z.date().or(z.string()),
	updated_at: z.date().or(z.string()),
	deleted_at: z.date().or(z.string()).nullable().optional(),
});

export const ConversationsResponseSchema = z.array(ConversationSchema);

export const ConversationMessageSchema = z.object({
	id: z.string(),
	conversation_id: z.string(),
	role: z.enum(["USER", "ASSISTANT", "SYSTEM", "user", "assistant", "system"]),
	content: z.string(),
	created_at: z.date().or(z.string()),
	updated_at: z.date().or(z.string()),
});

export const ConversationResponseSchema = ConversationSchema.extend({
	messages: z.array(ConversationMessageSchema),
});

export const ConversationDetailsSchema = ConversationResponseSchema;

export const GetConversationsQuerySchema = z.object({
	query: z
		.object({
			page: z.coerce
				.number()
				.int({ message: "Le numéro de page doit être un entier" })
				.positive({ message: "Le numéro de page doit être strictement positif" })
				.optional(),
			pageSize: z.coerce
				.number()
				.int({ message: "La taille de page doit être un entier" })
				.positive({ message: "La taille de page doit être strictement positive" })
				.max(100, { message: "La taille de page ne peut pas dépasser 100" })
				.optional(),
			limit: z.coerce
				.number()
				.int({ message: "La limite doit être un entier" })
				.positive({ message: "La limite doit être strictement positive" })
				.optional(),
			offset: z.coerce
				.number()
				.int({ message: "L'offset doit être un entier" })
				.nonnegative({ message: "L'offset doit être positif ou nul" })
				.optional(),
			search: z.string().trim().optional(),
		})
		.optional(),
});

export type GetConversation = z.infer<typeof GetConversationSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationsResponse = z.infer<typeof ConversationsResponseSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;
export type ConversationDetails = z.infer<typeof ConversationDetailsSchema>;
export type GetConversationsQuery = z.infer<typeof GetConversationsQuerySchema>;
