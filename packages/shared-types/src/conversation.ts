import { z } from "zod";

export const MessageRoleSchema = z.enum(["USER", "ASSISTANT"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  model: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable().optional(),
  messages: z.array(MessageSchema).optional(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const CreateMessageRequestSchema = z.object({
  prompt: z.string().min(1),
  conversation_id: z.string().uuid().optional(),
  model: z.string().optional(),
});
export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;
