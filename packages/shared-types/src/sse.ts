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

// Types prédéfinis pour les sources de données
export const SourceTypeEnum = z.enum(["doc", "sql", "api", "web", "file", "database", "other"]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

// Schéma pour les sources de données
export const SourceDataSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Le titre de la source est obligatoire"),
  type: SourceTypeEnum,
  url: z.string().optional(),
});
export type SourceData = z.infer<typeof SourceDataSchema>;

// Événement Source
export const SseSourceEventSchema = z.object({
  type: z.literal("source"),
  payload: z.object({
    job_id: z.string(),
    source: SourceDataSchema,
    chunk: z.string().optional(),
  }),
  timestamp: z.string().optional(),
});
export type SseSourceEvent = z.infer<typeof SseSourceEventSchema>;

// Événement Inconnu / Générique pour Tolérance SDK
export const SseGenericEventSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.any()).optional(),
  timestamp: z.string().optional(),
});
export type SseGenericEvent = z.infer<typeof SseGenericEventSchema>;

export type SseEvent =
  | SseTokenEvent
  | SseStatusEvent
  | SseStatisticsEvent
  | SseSourceEvent
  | SseGenericEvent;
