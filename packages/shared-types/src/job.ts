import { z } from "zod";

export const JobStatusSchema = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "DEFERRED",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobStatisticsSchema = z.object({
  generated_tokens: z.number().int().nonnegative(),
  total_generation_time: z.number().nonnegative(),
  time_to_first_token: z.number().nonnegative(),
  tokens_per_second: z.number().nonnegative(),
});
export type JobStatistics = z.infer<typeof JobStatisticsSchema>;

export const JobSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  user_prompt_id: z.string().uuid(),
  assistant_message_id: z.string().uuid(),
  model: z.string(),
  status: JobStatusSchema,
  time_to_first_token: z.number().nullable().optional(),
  tokens_per_second: z.number().nullable().optional(),
  generated_tokens: z.number().int().nullable().optional(),
  error: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Job = z.infer<typeof JobSchema>;
