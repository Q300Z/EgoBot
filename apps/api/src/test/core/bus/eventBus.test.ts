import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { TypedEventBus } from "../../../core/bus/eventBus";
import { defineCommand, defineEvent } from "../../../core/bus/bus.types";
import { traceStorage } from "../../../config/trace";

describe("TypedEventBus (TDD)", () => {
	let bus: TypedEventBus;

	beforeEach(() => {
		bus = new TypedEventBus();
	});

	describe("Commands (Request / Reply)", () => {
		const pingCommand = defineCommand(
			"test.ping",
			z.object({ message: z.string() }),
			z.object({ reply: z.string(), length: z.number() }),
		);

		it("should execute registered handler and return validated output", async () => {
			bus.registerHandler(pingCommand, async (input) => {
				return {
					reply: `Pong: ${input.message}`,
					length: input.message.length,
				};
			});

			const response = await bus.request(pingCommand, { message: "Hello" });

			expect(response).toEqual({
				reply: "Pong: Hello",
				length: 5,
			});
		});

		it("should fail when no handler is registered", async () => {
			await expect(bus.request(pingCommand, { message: "Hello" })).rejects.toThrow(
				'Aucun gestionnaire enregistré pour la commande "test.ping"',
			);
		});

		it("should prevent duplicate handler registration for same command", () => {
			bus.registerHandler(pingCommand, async () => ({ reply: "1", length: 1 }));

			expect(() => {
				bus.registerHandler(pingCommand, async () => ({ reply: "2", length: 2 }));
			}).toThrow('Conflit : un gestionnaire est déjà enregistré pour la commande "test.ping"');
		});

		it("should validate input schema and reject invalid input", async () => {
			bus.registerHandler(pingCommand, async (input) => ({
				reply: input.message,
				length: input.message.length,
			}));

			// @ts-expect-error test runtime invalid type
			await expect(bus.request(pingCommand, { message: 12345 })).rejects.toThrow();
		});

		it("should validate output schema and reject invalid output from handler", async () => {
			// Handler returns invalid structure
			// @ts-expect-error invalid return
			bus.registerHandler(pingCommand, async () => ({
				reply: "Missing length",
			}));

			await expect(bus.request(pingCommand, { message: "test" })).rejects.toThrow();
		});

		it("should timeout if handler takes too long", async () => {
			bus.registerHandler(pingCommand, async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				return { reply: "Late", length: 4 };
			});

			await expect(bus.request(pingCommand, { message: "test" }, 30)).rejects.toThrow(
				'Délai d\'attente dépassé pour la commande "test.ping"',
			);
		});

		it("should propagate handler exceptions properly", async () => {
			bus.registerHandler(pingCommand, async () => {
				throw new Error("Business rule violation");
			});

			await expect(bus.request(pingCommand, { message: "test" })).rejects.toThrow("Business rule violation");
		});
	});

	describe("Events (Emit / On)", () => {
		const userCreatedEvent = defineEvent(
			"user.created",
			z.object({
				userId: z.string(),
				email: z.string().email(),
			}),
		);

		it("should emit and deliver event to multiple listeners", async () => {
			const listenerA = vi.fn();
			const listenerB = vi.fn();

			bus.on(userCreatedEvent, listenerA);
			bus.on(userCreatedEvent, listenerB);

			bus.emit(userCreatedEvent, {
				userId: "user-123",
				email: "test@example.com",
			});

			expect(listenerA).toHaveBeenCalledWith({
				userId: "user-123",
				email: "test@example.com",
			});
			expect(listenerB).toHaveBeenCalledWith({
				userId: "user-123",
				email: "test@example.com",
			});
		});

		it("should allow unsubscribing listener", () => {
			const listener = vi.fn();
			const unsubscribe = bus.on(userCreatedEvent, listener);

			bus.emit(userCreatedEvent, {
				userId: "user-1",
				email: "test@example.com",
			});
			expect(listener).toHaveBeenCalledTimes(1);

			unsubscribe();

			bus.emit(userCreatedEvent, {
				userId: "user-2",
				email: "test@example.com",
			});
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it("should reject invalid event payload according to schema", () => {
			const listener = vi.fn();
			bus.on(userCreatedEvent, listener);

			expect(() => {
				bus.emit(userCreatedEvent, {
					userId: "user-1",
					email: "not-an-email",
				});
			}).toThrow();

			expect(listener).not.toHaveBeenCalled();
		});

		it("should propagate trace context through AsyncLocalStorage during event delivery", () => {
			const eventWithTrace = defineEvent(
				"test.trace",
				z.object({
					correlationId: z.string(),
					userId: z.string(),
				}),
			);

			const listener = vi.fn(() => {
				const store = traceStorage.getStore();
				expect(store?.correlationId).toBe("trace-999");
				expect(store?.userId).toBe("user-888");
			});

			bus.on(eventWithTrace, listener);

			bus.emit(eventWithTrace, {
				correlationId: "trace-999",
				userId: "user-888",
			});

			expect(listener).toHaveBeenCalled();
		});
	});

	describe("Lifecycle and Reset", () => {
		it("should reset all command handlers and event listeners", async () => {
			const pingCmd = defineCommand("test.reset.ping", z.object({}), z.object({ ok: z.boolean() }));
			const userEvt = defineEvent("test.reset.event", z.object({ id: z.string() }));

			bus.registerHandler(pingCmd, async () => ({ ok: true }));
			const listener = vi.fn();
			bus.on(userEvt, listener);

			bus.reset();

			await expect(bus.request(pingCmd, {})).rejects.toThrow(
				'Aucun gestionnaire enregistré pour la commande "test.reset.ping"',
			);
			bus.emit(userEvt, { id: "1" });
			expect(listener).not.toHaveBeenCalled();
		});
	});
});
