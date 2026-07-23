import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEventStream } from "./event-client.js";

describe("createEventStream", () => {
  class MockEventSource {
    url: string;
    onopen: (() => void) | null = null;
    onmessage: ((event: any) => void) | null = null;
    onerror: ((err: any) => void) | null = null;
    closed = false;

    constructor(url: string) {
      this.url = url;
    }

    close() {
      this.closed = true;
    }
  }

  beforeEach(() => {
    (globalThis as any).EventSource = MockEventSource;
    (globalThis as any).window = { location: { origin: "http://localhost:3000" } };
  });

  it("should initialize EventSource with base URL and lastEventId if provided", () => {
    let createdUrl = "";
    (globalThis as any).EventSource = class extends MockEventSource {
      constructor(url: string) {
        super(url);
        createdUrl = url;
      }
    };

    createEventStream({
      streamUrl: "http://localhost:3000/sse/v1/job/123",
      lastEventId: "evt-99",
    });

    expect(createdUrl).toContain("lastEventId=evt-99");
  });

  it("should trigger onOpen callback when connection opens", () => {
    let instance: any = null;
    (globalThis as any).EventSource = class extends MockEventSource {
      constructor(url: string) {
        super(url);
        instance = this;
      }
    };

    const onOpen = vi.fn();
    createEventStream({
      streamUrl: "http://localhost:3000/sse/v1/job/123",
      onOpen,
    });

    instance?.onopen?.();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("should handle progress, completed, failedJob, and cancelled messages", () => {
    let instance: MockEventSource | null = null;
    (globalThis as any).EventSource = class extends MockEventSource {
      constructor(url: string) {
        super(url);
        instance = this;
      }
    };

    const onProgress = vi.fn();
    const onCompleted = vi.fn();
    const onFailedJob = vi.fn();
    const onCancelled = vi.fn();

    createEventStream({
      streamUrl: "http://localhost:3000/sse/v1/job/123",
      onProgress,
      onCompleted,
      onFailedJob,
      onCancelled,
    });

    const es = instance!;

    // 1. Progress (kind: token)
    es.onmessage!({
      lastEventId: "evt-1",
      data: JSON.stringify({ kind: "token", chunk: "Hello" }),
    });
    expect(onProgress).toHaveBeenCalledWith({ kind: "token", chunk: "Hello" }, "evt-1");

    // 2. Completed (kind: stats & status: COMPLETED)
    es.onmessage!({
      lastEventId: "evt-2",
      data: JSON.stringify({ kind: "stats", status: "COMPLETED", statistics: { generated_tokens: 10 } }),
    });
    expect(onCompleted).toHaveBeenCalledWith(
      { kind: "stats", status: "COMPLETED", statistics: { generated_tokens: 10 } },
      "evt-2"
    );

    // 3. FailedJob (status: FAILED)
    es.onmessage!({
      data: JSON.stringify({ status: "FAILED", error: "Internal Error" }),
    });
    expect(onFailedJob).toHaveBeenCalledWith(
      { status: "FAILED", error: "Internal Error" },
      "evt-2" // Uses current lastEventId
    );

    // 4. Cancelled (status: CANCELLED)
    es.onmessage!({
      data: JSON.stringify({ status: "CANCELLED" }),
    });
    expect(onCancelled).toHaveBeenCalledWith(
      { status: "CANCELLED" },
      "evt-2"
    );
  });

  it("should handle malformed JSON payload silently", () => {
    let instance: MockEventSource | null = null;
    (globalThis as any).EventSource = class extends MockEventSource {
      constructor(url: string) {
        super(url);
        instance = this;
      }
    };

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    createEventStream({
      streamUrl: "http://localhost:3000/sse/v1/job/123",
    });

    expect(() => {
      instance!.onmessage!({ data: "{ bad json" });
    }).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to parse SSE payload", expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it("should handle error, close stream and invoke callbacks", () => {
    let instance: MockEventSource | null = null;
    (globalThis as any).EventSource = class extends MockEventSource {
      constructor(url: string) {
        super(url);
        instance = this;
      }
    };

    const onError = vi.fn();
    const onFailed = vi.fn();

    const stream = createEventStream({
      streamUrl: "http://localhost:3000/sse/v1/job/123",
      onError,
      onFailed,
    });

    instance!.onerror!({});
    expect(onError).toHaveBeenCalledWith("SSE Connection error");
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(instance!.closed).toBe(true);

    // Calling close explicitly
    stream.close();
    expect(instance!.closed).toBe(true);
  });
});
