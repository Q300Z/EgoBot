import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoggerFactory, logger } from "../../config/logger";

describe("LoggerFactory & Abstract Logger", () => {
	let pinoSpy: any;

	beforeEach(() => {
		pinoSpy = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		};

		const originalChild = logger.child.bind(logger);
		vi.spyOn(logger, "child").mockImplementation((bindings) => {
			const realChild = originalChild(bindings);
			return {
				debug: (meta: any, msg: any) => {
					if (realChild.isLevelEnabled("debug")) {
						pinoSpy.debug({ ...bindings, ...meta }, msg);
					}
				},
				info: (meta: any, msg: any) => {
					if (realChild.isLevelEnabled("info")) {
						pinoSpy.info({ ...bindings, ...meta }, msg);
					}
				},
				warn: (meta: any, msg: any) => {
					if (realChild.isLevelEnabled("warn")) {
						pinoSpy.warn({ ...bindings, ...meta }, msg);
					}
				},
				error: (meta: any, msg: any) => {
					if (realChild.isLevelEnabled("error")) {
						pinoSpy.error({ ...bindings, ...meta }, msg);
					}
				},
			} as any;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should create a logger with a label", () => {
		const logger = LoggerFactory.getLogger("TestLabel");
		expect(logger).toBeDefined();
	});

	it("should respect log levels (default to INFO)", () => {
		const originalLevel = logger.level;
		logger.level = "info";
		try {
			const levelLogger = LoggerFactory.getLogger("LevelTest");

			levelLogger.debug("hidden");
			expect(pinoSpy.debug).not.toHaveBeenCalled();

			levelLogger.info("visible");
			expect(pinoSpy.info).toHaveBeenCalled();
		} finally {
			logger.level = originalLevel;
		}
	});

	it("should include metadata and correlation ID in logs", () => {
		const logger = LoggerFactory.getLogger("MetaTest");
		const meta = { userId: "user-1", correlationId: "req-abc" };

		logger.info("message", meta);

		expect(pinoSpy.info).toHaveBeenCalledWith(
			expect.objectContaining({
				label: "MetaTest",
				userId: "user-1",
				correlationId: "req-abc",
			}),
			"message",
		);
	});

	it("should log warnings correctly", () => {
		const logger = LoggerFactory.getLogger("WarnTest");
		logger.warn("this is a warning");
		expect(pinoSpy.warn).toHaveBeenCalledWith(expect.objectContaining({ label: "WarnTest" }), "this is a warning");
	});

	it("should log errors with stack trace", () => {
		const logger = LoggerFactory.getLogger("ErrorTest");
		const error = new Error("boom");
		logger.error("something failed", error);

		expect(pinoSpy.error).toHaveBeenCalledWith(
			expect.objectContaining({
				label: "ErrorTest",
				err: error,
			}),
			"something failed",
		);
	});

	it("should log non-error objects in error method", () => {
		const logger = LoggerFactory.getLogger("ErrorTest2");
		logger.error("failed", "string error");

		expect(pinoSpy.error).toHaveBeenCalledWith(
			expect.objectContaining({
				label: "ErrorTest2",
				error: "string error",
			}),
			"failed",
		);
	});
});
