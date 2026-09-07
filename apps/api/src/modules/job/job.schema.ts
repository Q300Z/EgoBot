import { z } from "zod";
import { LogipolConfigSchema } from "../auth/auth.schema";

export const RoleEnum = z.enum(["USER", "ASSISTANT", "SYSTEM"]);

export const JobStatusEnum = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED", "DEFERRED"]);
export const JobEventKindEnum = z.enum(["state", "token", "progress", "stats", "source"]);

export const JobStatisticsSchema = z
	.object({
		generated_tokens: z.number().int().nonnegative().optional(),
		total_generation_time: z.number().nonnegative().optional(),
		time_to_first_token: z.number().nonnegative().optional(),
		tokens_per_second: z.number().nonnegative().optional(),
		context_utilization: z.number().nonnegative().optional(),
	})
	.catchall(z.unknown());

const JobBasePayloadSchema = z
	.object({
		kind: JobEventKindEnum,
		job_id: z.string(),
		conversation_id: z.string().optional(),
		dev: z.union([z.string(), z.boolean()]).transform((v) => String(v)),
	})
	.passthrough();

export const JobCreatedPayloadSchema = JobBasePayloadSchema.extend({
	kind: z.literal("state"),
	status: z.enum(["PENDING", "DEFERRED"]),
	conversation_id: z.string(),
	data: z
		.object({
			email: z.string().optional(),
			url: z.string().optional(),
			key_db: z.string().nullable().optional(),
			prompt: z.string().min(1).optional(),
			history: z.array(z.object({ content: z.string(), role: RoleEnum })).optional(),
		})
		.optional(),
}).passthrough();

export const JobProgressPayloadSchema = JobBasePayloadSchema.extend({
	kind: z.enum(["token", "progress"]),
	status: z.literal("IN_PROGRESS"),
	chunk: z.string(),
}).passthrough();

export const JobProgressMinimalSchema = z
	.object({
		kind: z.literal("token"),
		status: z.literal("IN_PROGRESS"),
		chunk: z.string(),
	})
	.passthrough();

export const JobSourcePayloadSchema = z
	.object({
		kind: z.literal("source").optional(),
		status: z.string().optional(),
		job_id: z.string().optional(),
		conversation_id: z.string().optional(),
		chunk: z.string().optional(),
		source: z
			.object({
				id: z.string().optional(),
				title: z.string(),
				url: z.string().optional(),
				type: z.string().optional(),
			})
			.passthrough(),
	})
	.passthrough();

export const JobCompletedPayloadSchema = JobBasePayloadSchema.extend({
	kind: z.enum(["state", "stats"]),
	status: z.literal("COMPLETED"),
	statistics: JobStatisticsSchema,
}).passthrough();

export const JobFailedPayloadSchema = JobBasePayloadSchema.extend({
	kind: z.literal("state"),
	status: z.literal("FAILED"),
	error: z.string().min(1),
}).passthrough();

export const JobCancelledPayloadSchema = JobBasePayloadSchema.extend({
	kind: z.literal("state"),
	status: z.literal("CANCELLED"),
	reason: z.string().min(1).optional(),
}).passthrough();

export const JobEventEnvelopeSchema = z.discriminatedUnion("event", [
	z.object({ event: z.literal("job.created"), data: JobCreatedPayloadSchema }).passthrough(),
	z
		.object({
			event: z.literal("job.progress"),
			data: z.union([JobProgressPayloadSchema, JobProgressMinimalSchema]),
		})
		.passthrough(),
	z.object({ event: z.literal("job.completed"), data: JobCompletedPayloadSchema }).passthrough(),
	z.object({ event: z.literal("job.failed"), data: JobFailedPayloadSchema }).passthrough(),
	z.object({ event: z.literal("job.cancelled"), data: JobCancelledPayloadSchema }).passthrough(),
	z.object({ event: z.literal("source"), data: JobSourcePayloadSchema }).passthrough(),
]);

export type Role = z.infer<typeof RoleEnum>;
export type JobStatus = z.infer<typeof JobStatusEnum>;
export type JobEventKind = z.infer<typeof JobEventKindEnum>;
export type JobStatistics = z.infer<typeof JobStatisticsSchema>;
export type JobCreatedPayload = z.infer<typeof JobCreatedPayloadSchema>;
export type JobProgressPayload = z.infer<typeof JobProgressPayloadSchema>;
export type JobCompletedPayload = z.infer<typeof JobCompletedPayloadSchema>;
export type JobFailedPayload = z.infer<typeof JobFailedPayloadSchema>;
export type JobCancelledPayload = z.infer<typeof JobCancelledPayloadSchema>;
export type JobEventEnvelope = z.infer<typeof JobEventEnvelopeSchema>;
