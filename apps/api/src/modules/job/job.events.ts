import { z } from "zod";
import { defineEvent } from "../../core/bus/bus.types";
import { JobEventEnvelopeSchema } from "./job.schema";

export const JobTokenEmittedSchema = z
	.object({
		jobId: z.string().min(1),
		eventId: z.string().optional(),
		env: z.enum(["dev", "prod"]).optional(),
		envelope: JobEventEnvelopeSchema,
	})
	.passthrough();

export const JobCreatedDoneSchema = z
	.object({
		jobId: z.string().min(1),
		conversationId: z.string().optional(),
		
		model: z.string(),
		correlationId: z.string().optional(),
		executeAt: z.string().optional(),
	})
	.passthrough();

export const JobCancelEventSchema = z
	.object({
		jobId: z.string().min(1),
		
	})
	.passthrough();

export const JobDeferEventSchema = z
	.object({
		jobId: z.string().min(1),
		targetModel: z.string(),
		
	})
	.passthrough();

export const JobCreateEventSchema = z
	.object({
		jobId: z.string().min(1),
		
	})
	.passthrough();

export const JobTimeoutEventSchema = z
	.object({
		jobId: z.string().min(1),
		reason: z.string().optional(),
	})
	.passthrough();

export const JobEvents = {
	tokenEmitted: defineEvent("job.token_emitted", JobTokenEmittedSchema),
	createdDone: defineEvent("job.created_done", JobCreatedDoneSchema),
	cancelRequest: defineEvent("job.cancel_request", JobCancelEventSchema),
	deferRequest: defineEvent("job.defer_request", JobDeferEventSchema),
	createRequest: defineEvent("job.create_request", JobCreateEventSchema),
	timeout: defineEvent("job.timeout", JobTimeoutEventSchema),
};

export type JobTokenEmitted = z.infer<typeof JobTokenEmittedSchema>;
export type JobCreatedDone = z.infer<typeof JobCreatedDoneSchema>;
export type JobCancelEvent = z.infer<typeof JobCancelEventSchema>;
export type JobDeferEvent = z.infer<typeof JobDeferEventSchema>;
