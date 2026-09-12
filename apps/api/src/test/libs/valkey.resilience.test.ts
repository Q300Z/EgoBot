import { describe, it, expect } from "vitest";
import {
	createGlideConfig,
	isTimeoutError,
	isConnectionError,
	isCircuitBreakerError,
	isValkeyError,
	TimeoutError,
	ConnectionError,
	CircuitBreakerError,
	ClosingError,
	RequestError,
	ProtocolVersion,
	ClientSideCache,
} from "../../config/valkey";

describe("Valkey GLIDE Resilience & Configuration", () => {
	it("should correctly identify typed errors using type guards", () => {
		const timeoutErr = new TimeoutError("Request timed out");
		const connErr = new ConnectionError("Network unreachable");
		const cbErr = new CircuitBreakerError("Breaker is open");
		const closingErr = new ClosingError("Client is closing");
		const genericErr = new Error("Regular JS error");

		expect(isTimeoutError(timeoutErr)).toBe(true);
		expect(isTimeoutError(connErr)).toBe(false);

		expect(isConnectionError(connErr)).toBe(true);
		expect(isConnectionError(timeoutErr)).toBe(false);

		expect(isCircuitBreakerError(cbErr)).toBe(true);
		expect(isCircuitBreakerError(closingErr)).toBe(false);

		expect(isValkeyError(timeoutErr)).toBe(true);
		expect(isValkeyError(connErr)).toBe(true);
		expect(isValkeyError(cbErr)).toBe(true);
		expect(isValkeyError(closingErr)).toBe(true);
		expect(isValkeyError(genericErr)).toBe(false);
	});

	it("should configure client-side caching when enabled", () => {
		const config = createGlideConfig({
			protocol: ProtocolVersion.RESP3,
			enableClientSideCache: true,
			cacheSizeKb: 2048,
			cacheTtlMs: 30000,
		});

		expect(config.clientSideCache).toBeDefined();
		expect(config.protocol).toBe(ProtocolVersion.RESP3);
	});

	it("should configure client circuit breaker when enabled", () => {
		const config = createGlideConfig({
			protocol: ProtocolVersion.RESP3,
			enableCircuitBreaker: true,
		});

		expect(config.clientCircuitBreaker).toBeDefined();
		expect(config.clientCircuitBreaker?.windowSizeMs).toBe(10000);
		expect(config.clientCircuitBreaker?.failureRateThreshold).toBe(0.5);
	});

	it("should disable client-side cache and circuit breaker when explicitly requested", () => {
		const config = createGlideConfig({
			protocol: ProtocolVersion.RESP2,
			enableClientSideCache: false,
			enableCircuitBreaker: false,
		});

		expect(config.clientSideCache).toBeUndefined();
		expect(config.clientCircuitBreaker).toBeUndefined();
		expect(config.protocol).toBe(ProtocolVersion.RESP2);
	});

	it("should correctly parse stream fields in various formats (arrays, {key, value}, maps, buffers)", async () => {
		const { parseStreamFields, parseStreamEntries } = await import("../../config/valkey");

		// 1. Array of flat pairs: ["event", "job.progress", "data", "test"]
		expect(parseStreamFields(["event", "job.progress", "data", "test"])).toEqual({
			event: "job.progress",
			data: "test",
		});

		// 2. Array of key-value objects from Valkey GLIDE: [{ key: "event", value: "job.progress" }]
		expect(
			parseStreamFields([
				{ key: "event", value: "job.progress" },
				{ key: "chunk", value: Buffer.from("hello") },
			]),
		).toEqual({
			event: "job.progress",
			chunk: "hello",
		});

		// 3. Map instance
		const mapFields = new Map<string, any>([
			["event", "source"],
			["url", Buffer.from("https://example.com")],
		]);
		expect(parseStreamFields(mapFields)).toEqual({
			event: "source",
			url: "https://example.com",
		});

		// 4. Stream entries with various formats
		const rawEntries = [
			{ id: "100-0", message: { event: "job.progress" } },
			{ id: "100-1", fields: [{ field: "event", value: "job.completed" }] },
			{ key: "100-2", value: [["event", "job.cancelled"]] },
			["100-3", [["event", "source"]]],
		];

		const parsed = parseStreamEntries(rawEntries);
		expect(parsed).toHaveLength(4);
		expect(parsed[0]).toEqual({ id: "100-0", message: { event: "job.progress" } });
		expect(parsed[1]).toEqual({ id: "100-1", message: { event: "job.completed" } });
		expect(parsed[2]).toEqual({ id: "100-2", message: { event: "job.cancelled" } });
		expect(parsed[3]).toEqual({ id: "100-3", message: { event: "source" } });
	});
});
