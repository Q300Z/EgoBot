import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Redis from "ioredis";
import { WorkerApplication } from "./application.js";

vi.mock("ioredis");

describe("WorkerApplication", () => {
  let mockRedisReader: any;
  let mockRedisWriter: any;

  beforeEach(() => {
    mockRedisReader = {
      xgroup: vi.fn().mockResolvedValue("OK"),
      xreadgroup: vi.fn().mockResolvedValue(null),
      xautoclaim: vi.fn().mockResolvedValue([ "0-0", [] ]),
      xack: vi.fn().mockResolvedValue(1),
      disconnect: vi.fn(),
    };

    mockRedisWriter = {
      set: vi.fn().mockResolvedValue("OK"),
      xadd: vi.fn().mockResolvedValue("1600000000000-0"),
      expire: vi.fn().mockResolvedValue(1),
      disconnect: vi.fn(),
    };

    let redisInstanceCount = 0;
    (Redis as any).mockImplementation(() => {
      redisInstanceCount++;
      return redisInstanceCount % 2 === 1 ? mockRedisReader : mockRedisWriter;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with given options and create Redis reader and writer", () => {
    const app = new WorkerApplication({
      workerId: "worker-1",
      models: ["model-a", "model-b"],
      env: "test",
      redisUrl: "redis://localhost:6379",
    });

    expect(Redis).toHaveBeenCalledWith("redis://localhost:6379");
    expect(Redis).toHaveBeenCalledTimes(2);

    app.stop();
    expect(mockRedisReader.disconnect).toHaveBeenCalled();
    expect(mockRedisWriter.disconnect).toHaveBeenCalled();
  });

  it("should use default env and redisUrl if omitted", () => {
    const app = new WorkerApplication({
      workerId: "worker-default",
      models: ["model-a"],
    });

    expect(Redis).toHaveBeenCalledWith("redis://localhost:6379");
    app.stop();
  });

  it("should register task handler", () => {
    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-a"],
    });
    const handler = vi.fn();
    app.registerTask("model-a", handler);
    // Verified internally during message processing
    app.stop();
  });

  it("should start loops and handle heartbeat and polling stop cleanly", async () => {
    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-a"],
      env: "test",
    });

    // Start application and stop immediately after first tick
    const startPromise = app.start();
    app.stop();

    await startPromise;

    expect(mockRedisWriter.set).toHaveBeenCalledWith(
      "workers:presence:w1:model-a",
      expect.stringContaining('"status":"online"'),
      "EX",
      15
    );
    expect(mockRedisReader.xgroup).toHaveBeenCalledWith(
      "CREATE",
      "jobs:queue:test:model-a",
      "group:llm-workers:test",
      "$",
      "MKSTREAM"
    );
  });

  it("should ignore error if xgroup creation fails (group already exists)", async () => {
    mockRedisReader.xgroup.mockRejectedValueOnce(new Error("BUSYGROUP Consumer Group name already exists"));

    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-a"],
      env: "test",
    });

    const startPromise = app.start();
    app.stop();
    await startPromise;

    expect(mockRedisReader.xgroup).toHaveBeenCalled();
  });

  it("should process message successfully and send job.completed event to sse stream", async () => {
    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-a"],
      env: "test",
    });

    const handler = vi.fn().mockImplementation(async (payload, ctx) => {
      await ctx.sendToken("chunk-1");
    });

    app.registerTask("model-a", handler);

    // Mock xreadgroup to return one valid message then null
    const validMessagePayload = {
      jobId: "job-100",
      conversationId: "conv-200",
      prompt: "test prompt",
    };

    mockRedisReader.xreadgroup.mockResolvedValueOnce([
      [
        "jobs:queue:test:model-a",
        [
          [
            "1600000000000-0",
            ["data", JSON.stringify(validMessagePayload)],
          ],
        ],
      ],
    ]);

    const startPromise = app.start();
    // Allow processMessage execution before stopping
    await new Promise((r) => setTimeout(r, 50));
    app.stop();
    await startPromise;

    expect(handler).toHaveBeenCalledWith(
      validMessagePayload,
      expect.objectContaining({ jobId: "job-100", conversationId: "conv-200" })
    );

    // Check completion envelope in redis writer
    expect(mockRedisWriter.xadd).toHaveBeenCalledWith(
      "jobs:sse:test:job-100",
      "MAXLEN",
      "~",
      1000,
      "*",
      "event",
      "job.completed",
      "data",
      expect.stringContaining('"status":"COMPLETED"')
    );

    expect(mockRedisReader.xack).toHaveBeenCalledWith(
      "jobs:queue:test:model-a",
      "group:llm-workers:test",
      "1600000000000-0"
    );
  });

  it("should ack and ignore message if missing jobId or conversationId", async () => {
    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-a"],
      env: "test",
    });

    mockRedisReader.xreadgroup.mockResolvedValueOnce([
      [
        "jobs:queue:test:model-a",
        [
          [
            "1600000000000-1",
            ["data", JSON.stringify({ prompt: "missing IDs" })],
          ],
        ],
      ],
    ]);

    const startPromise = app.start();
    await new Promise((r) => setTimeout(r, 50));
    app.stop();
    await startPromise;

    expect(mockRedisReader.xack).toHaveBeenCalledWith(
      "jobs:queue:test:model-a",
      "group:llm-workers:test",
      "1600000000000-1"
    );
  });

  it("should ack and warn if no handler is registered for model", async () => {
    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-unregistered"],
      env: "test",
    });

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockRedisReader.xreadgroup.mockResolvedValueOnce([
      [
        "jobs:queue:test:model-unregistered",
        [
          [
            "1600000000000-2",
            ["data", JSON.stringify({ jobId: "j1", conversationId: "c1" })],
          ],
        ],
      ],
    ]);

    const startPromise = app.start();
    await new Promise((r) => setTimeout(r, 50));
    app.stop();
    await startPromise;

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Aucun handler enregistré"));
    expect(mockRedisReader.xack).toHaveBeenCalledWith(
      "jobs:queue:test:model-unregistered",
      "group:llm-workers:test",
      "1600000000000-2"
    );
    consoleWarnSpy.mockRestore();
  });

  it("should handle processing failure and retry when retryCount < 3", async () => {
    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-a"],
      env: "test",
    });

    const handler = vi.fn().mockRejectedValue(new Error("Transient API error"));
    app.registerTask("model-a", handler);

    mockRedisReader.xreadgroup.mockResolvedValueOnce([
      [
        "jobs:queue:test:model-a",
        [
          [
            "1600000000000-3",
            ["data", JSON.stringify({ jobId: "j-fail", conversationId: "c-fail", _retryCount: 1 })],
          ],
        ],
      ],
    ]);

    const startPromise = app.start();
    await new Promise((r) => setTimeout(r, 50));
    app.stop();
    await startPromise;

    // Retry logic re-adds message with retryCount = 2
    expect(mockRedisWriter.xadd).toHaveBeenCalledWith(
      "jobs:queue:test:model-a",
      "*",
      "data",
      expect.stringContaining('"_retryCount":2')
    );

    expect(mockRedisReader.xack).toHaveBeenCalledWith(
      "jobs:queue:test:model-a",
      "group:llm-workers:test",
      "1600000000000-3"
    );
  });

  it("should send message to DLQ when retryCount >= 3", async () => {
    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-a"],
      env: "test",
    });

    const handler = vi.fn().mockRejectedValue(new Error("Fatal error"));
    app.registerTask("model-a", handler);

    mockRedisReader.xreadgroup.mockResolvedValueOnce([
      [
        "jobs:queue:test:model-a",
        [
          [
            "1600000000000-4",
            ["data", JSON.stringify({ jobId: "j-fatal", conversationId: "c-fatal", _retryCount: 2 })],
          ],
        ],
      ],
    ]);

    const startPromise = app.start();
    await new Promise((r) => setTimeout(r, 50));
    app.stop();
    await startPromise;

    // Route to DLQ
    expect(mockRedisWriter.xadd).toHaveBeenCalledWith(
      "jobs:queue:test:model-a:dlq",
      "*",
      "originalId",
      "1600000000000-4",
      "payload",
      expect.any(String),
      "error",
      "Fatal error",
      "failedAt",
      expect.any(String)
    );

    expect(mockRedisReader.xack).toHaveBeenCalledWith(
      "jobs:queue:test:model-a",
      "group:llm-workers:test",
      "1600000000000-4"
    );
  });

  it("should recover orphaned messages via xautoclaim in PEL recovery loop", async () => {
    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-a"],
      env: "test",
    });

    const handler = vi.fn().mockResolvedValue(undefined);
    app.registerTask("model-a", handler);

    mockRedisReader.xautoclaim.mockResolvedValueOnce([
      "0-0",
      [
        [
          "1600000000000-5",
          ["data", JSON.stringify({ jobId: "j-orphan", conversationId: "c-orphan" })],
        ],
      ],
    ]);

    const startPromise = app.start();
    await new Promise((r) => setTimeout(r, 50));
    app.stop();
    await startPromise;

    expect(handler).toHaveBeenCalledWith(
      { jobId: "j-orphan", conversationId: "c-orphan" },
      expect.anything()
    );
  });

  it("should handle error in pollQueues gracefully", async () => {
    const app = new WorkerApplication({
      workerId: "w1",
      models: ["model-a"],
      env: "test",
    });

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockRedisReader.xreadgroup.mockRejectedValueOnce(new Error("Redis connection dropped"));

    const startPromise = app.start();
    await new Promise((r) => setTimeout(r, 50));
    app.stop();
    await startPromise;

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Erreur lors du polling Redis Streams"),
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});
