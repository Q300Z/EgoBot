import { z } from "zod";
import { ModelEnum } from "../auth/auth.schema";

export const PostMessageSchema = z.object({
	body: z.object({
		conversation_id: z
			.string()
			.trim()
			.min(1, { message: "L'identifiant de la conversation ne peut pas être vide" })
			.optional(),
		prompt: z
			.string({ message: "Le message ne peut pas être vide" })
			.trim()
			.min(1, { message: "Le message ne peut pas être vide" })
			.max(50000, { message: "Le message ne peut pas dépasser 50000 caractères" }),
		execute_at: z.string().datetime({ message: "Le format de la date execute_at est invalide" }).optional(),
		model: ModelEnum.optional(),
	}),
});

export const CancelMessageSchema = z.object({
	params: z.object({
		id: z.string().trim().min(1, { message: "L'identifiant du message ou job ne peut pas être vide" }),
	}),
});

export const MessageResponseSchema = z.object({
	job_id: z.string().min(1),
	conversation_id: z.string().min(1),
	stream_url: z.string().min(1),
});

export type PostMessage = z.infer<typeof PostMessageSchema>;
export type CancelMessage = z.infer<typeof CancelMessageSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
