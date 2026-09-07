import { describe, expect, it, vi } from "vitest";
import { redisReader, redisStream, redisWriter, connectRedisClients, reconnectStrategy } from "../../config/redis";

describe("redis.ts utils", () => {
	it("should connect redis clients", async () => {
		const streamConnect = vi.spyOn(redisStream, "connect").mockResolvedValue(undefined as any);
		const readerConnect = vi.spyOn(redisReader, "connect").mockResolvedValue(undefined as any);
		const writerConnect = vi.spyOn(redisWriter, "connect").mockResolvedValue(undefined as any);

		await expect(connectRedisClients()).resolves.not.toThrow();

		expect(streamConnect).toHaveBeenCalled();
		expect(readerConnect).toHaveBeenCalled();
		expect(writerConnect).toHaveBeenCalled();

		streamConnect.mockRestore();
		readerConnect.mockRestore();
		writerConnect.mockRestore();
	});

	it("should compute reconnect strategy correctly", () => {
		// Mock Math.random to return 0.5
		const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

		const delay = reconnectStrategy(5);
		// retries = 5 -> base = Math.min(5 * 100, 2000) = 500
		// jitter = 0.5 * 200 = 100
		// delay = 500 + 100 = 600
		expect(delay).toBe(600);

		mathRandomSpy.mockRestore();
	});
});
