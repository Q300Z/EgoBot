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
});
