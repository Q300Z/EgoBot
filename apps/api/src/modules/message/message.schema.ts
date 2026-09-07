import { z } from "zod";

export const PostMessageSchema = z.object({
	body: z.object({
		conversation_id: z.string().optional(),
		prompt: z.string().trim(),
		execute_at: z.string().datetime().optional(),
	}),
});

export const CancelMessageSchema = z.object({
	params: z.object({
		id: z.string(),
	}),
});

export const MessageResponseSchema = z.object({
	job_id: z.string(),
	conversation_id: z.string(),
	stream_url: z.string(),
});

export type PostMessage = z.infer<typeof PostMessageSchema>;
export type CancelMessage = z.infer<typeof CancelMessageSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
