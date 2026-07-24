import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWorkerContext } from "./context.js";

describe("createWorkerContext", () => {
  let mockRedisWriter: any;

  beforeEach(() => {
    mockRedisWriter = {
      xadd: vi.fn().mockResolvedValue("1600000000000-0"),
      expire: vi.fn().mockResolvedValue(1),
      exists: vi.fn(),
    };
  });

  it("should create context with correct jobId and conversationId", () => {
    const ctx = createWorkerContext("job-1", "conv-1", "test", mockRedisWriter);
    expect(ctx.jobId).toBe("job-1");
    expect(ctx.conversationId).toBe("conv-1");
  });

  it("should send token to redis sse stream and set TTL expiration", async () => {
    const ctx = createWorkerContext("job-123", "conv-456", "production", mockRedisWriter);

    await ctx.sendToken("Hello world");

    expect(mockRedisWriter.xadd).toHaveBeenCalledWith(
      "jobs:sse:production:job-123",
      "MAXLEN",
      "~",
      1000,
      "*",
      "event",
      "job.progress",
      "data",
      expect.any(String)
    );

    const dataString = mockRedisWriter.xadd.mock.calls[0][8];
    const parsed = JSON.parse(dataString);
    expect(parsed).toEqual({
      event: "job.progress",
      data: {
        kind: "token",
        status: "IN_PROGRESS",
        job_id: "job-123",
        conversation_id: "conv-456",
        chunk: "Hello world",
      },
    });

    expect(mockRedisWriter.expire).toHaveBeenCalledWith("jobs:sse:production:job-123", 3600);
  });

  it("should handle deferJob by publishing defer token pattern", async () => {
    const ctx = createWorkerContext("job-789", "conv-000", "staging", mockRedisWriter);

    await ctx.deferJob("gpt-4-turbo");

    expect(mockRedisWriter.xadd).toHaveBeenCalledWith(
      "jobs:sse:staging:job-789",
      "MAXLEN",
      "~",
      1000,
      "*",
      "event",
      "job.progress",
      "data",
      expect.any(String)
    );

    const dataString = mockRedisWriter.xadd.mock.calls[0][8];
    const parsed = JSON.parse(dataString);
    expect(parsed.data.chunk).toBe("__DEFER_JOB__:gpt-4-turbo");
    expect(mockRedisWriter.expire).toHaveBeenCalledWith("jobs:sse:staging:job-789", 3600);
  });

  it("should check cancellation status from Redis", async () => {
    const ctx = createWorkerContext("job-cancel-me", "conv-1", "test", mockRedisWriter);

    mockRedisWriter.exists.mockResolvedValueOnce(1);
    const isCancelled = await ctx.checkCancellation();
    expect(mockRedisWriter.exists).toHaveBeenCalledWith("jobs:cancel:job-cancel-me");
    expect(isCancelled).toBe(true);

    mockRedisWriter.exists.mockResolvedValueOnce(0);
    const isNotCancelled = await ctx.checkCancellation();
    expect(isNotCancelled).toBe(false);
  });
});
