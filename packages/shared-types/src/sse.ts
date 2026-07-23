import { z } from "zod";

// Événement Token
export const SseTokenEventSchema = z.object({
  type: z.literal("token"),
  payload: z.object({
    job_id: z.string(),
    chunk: z.string(),
  }),
  timestamp: z.string().optional(),
});
export type SseTokenEvent = z.infer<typeof SseTokenEventSchema>;

// Événement Statut
export const SseStatusEventSchema = z.object({
  type: z.literal("status"),
  payload: z.object({
    job_id: z.string(),
    status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]),
    error: z.string().optional(),
  }),
  timestamp: z.string().optional(),
});
export type SseStatusEvent = z.infer<typeof SseStatusEventSchema>;

// Événement Statistiques
export const SseStatisticsEventSchema = z.object({
  type: z.literal("statistics"),
  payload: z.object({
    job_id: z.string(),
    generated_tokens: z.number().optional(),
    tokens_per_second: z.number().optional(),
    time_to_first_token: z.number().optional(),
  }),
  timestamp: z.string().optional(),
});
export type SseStatisticsEvent = z.infer<typeof SseStatisticsEventSchema>;

// Événement Inconnu / Générique pour Tolérance SDK
export const SseGenericEventSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.any()).optional(),
  timestamp: z.string().optional(),
});
export type SseGenericEvent = z.infer<typeof SseGenericEventSchema>;

export type SseEvent = SseTokenEvent | SseStatusEvent | SseStatisticsEvent | SseGenericEvent;
