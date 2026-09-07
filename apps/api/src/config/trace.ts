import { AsyncLocalStorage } from "async_hooks";

export interface TraceContext {
	correlationId: string;
	userId?: string;
	email?: string;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();
