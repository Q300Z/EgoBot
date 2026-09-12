import type { z } from "zod";

// ============================================================================
/**
 * Format brut d'un message transitant dans un flux Redis Stream.
 */
// ============================================================================
export interface RedisWireMessage {
	event: string;
	data: string;
	correlationId: string;
	timestamp: number;
}

// ============================================================================
/**
 * Contrat d'un événement de réponse transitant sur jobs:sse:<env>:<id>.
 */
// ============================================================================
export interface StreamEventContract<TPayload extends z.ZodTypeAny = z.ZodTypeAny> {
	readonly name: string;
	readonly payloadSchema: TPayload;
}

// ============================================================================
/**
 * Contrat d'une file de worker (Request Queue vers Response Stream).
 */
// ============================================================================
export interface WorkerQueueContract<
	TRequest extends z.ZodTypeAny = z.ZodTypeAny,
	TEvents extends Record<string, StreamEventContract<any>> = Record<string, StreamEventContract<any>>,
> {
	readonly workerType: string;
	readonly requestSchema: TRequest;
	readonly terminalEvents: string[];
	readonly pollIntervalMs: number;
	readonly events?: TEvents;
}

// ============================================================================
/**
 * Définit un événement de stream typé avec son schéma Zod.
 */
// ============================================================================
export function defineStreamEvent<TPayload extends z.ZodTypeAny>(
	name: string,
	payloadSchema: TPayload,
): StreamEventContract<TPayload> {
	return { name, payloadSchema };
}

// ============================================================================
/**
 * Configuration pour définir une file de worker.
 */
// ============================================================================
export interface WorkerQueueConfig<
	TRequest extends z.ZodTypeAny,
	TEvents extends Record<string, StreamEventContract<any>>,
> {
	workerType: string;
	requestSchema: TRequest;
	terminalEvents?: string[];
	pollIntervalMs?: number;
	events?: TEvents;
}

// ============================================================================
/**
 * Définit une file de worker avec validation et cadencement adaptés.
 */
// ============================================================================
export function defineWorkerQueue<
	TRequest extends z.ZodTypeAny,
	TEvents extends Record<string, StreamEventContract<any>> = Record<string, StreamEventContract<any>>,
>(config: WorkerQueueConfig<TRequest, TEvents>): WorkerQueueContract<TRequest, TEvents> {
	return {
		workerType: config.workerType,
		requestSchema: config.requestSchema,
		terminalEvents: config.terminalEvents ?? [],
		pollIntervalMs: config.pollIntervalMs ?? 5000,
		events: config.events,
	};
}
