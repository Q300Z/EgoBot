import type { z } from "zod";

// ============================================================================
/**
 * Contrat d'une commande métier typée (Request/Reply synchrone).
 */
// ============================================================================
export interface CommandContract<TIn extends z.ZodTypeAny, TOut extends z.ZodTypeAny> {
	readonly name: string;
	readonly inputSchema: TIn;
	readonly outputSchema: TOut;
}

// ============================================================================
/**
 * Contrat d'un événement métier typé (Fire & Forget asynchrone).
 */
// ============================================================================
export interface EventContract<TPayload extends z.ZodTypeAny> {
	readonly name: string;
	readonly payloadSchema: TPayload;
}

// ============================================================================
/**
 * Définit une commande typée avec ses schémas d'entrée et de sortie Zod.
 */
// ============================================================================
export function defineCommand<TIn extends z.ZodTypeAny, TOut extends z.ZodTypeAny>(
	name: string,
	inputSchema: TIn,
	outputSchema: TOut,
): CommandContract<TIn, TOut> {
	return { name, inputSchema, outputSchema };
}

// ============================================================================
/**
 * Définit un événement typé avec son schéma de charge utile Zod.
 */
// ============================================================================
export function defineEvent<TPayload extends z.ZodTypeAny>(
	name: string,
	payloadSchema: TPayload,
): EventContract<TPayload> {
	return { name, payloadSchema };
}
