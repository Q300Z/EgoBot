import { describe, it, expect } from "vitest";
import {
  SseTokenEventSchema,
  SseStatusEventSchema,
  SseStatisticsEventSchema,
  SseGenericEventSchema,
} from "./sse.js";

describe("SSE Schemas", () => {
  describe("SseTokenEventSchema", () => {
    it("should parse valid token event", () => {
      const event = {
        type: "token" as const,
        payload: {
          job_id: "job-123",
          chunk: "Hello world",
        },
        timestamp: "2026-07-23T10:00:00.000Z",
      };
      expect(SseTokenEventSchema.parse(event)).toEqual(event);
    });

    it("should parse token event without timestamp", () => {
      const event = {
        type: "token" as const,
        payload: {
          job_id: "job-123",
          chunk: "Hello",
        },
      };
      expect(SseTokenEventSchema.parse(event)).toEqual(event);
    });

    it("should reject token event with wrong type", () => {
      expect(() =>
        SseTokenEventSchema.parse({
          type: "status",
          payload: { job_id: "1", chunk: "a" },
        })
      ).toThrow();
    });
  });

  describe("SseStatusEventSchema", () => {
    it("should parse valid status event", () => {
      const event = {
        type: "status" as const,
        payload: {
          job_id: "job-123",
          status: "COMPLETED" as const,
          error: undefined,
        },
      };
      expect(SseStatusEventSchema.parse(event)).toEqual(event);
    });

    it("should accept all allowed status values", () => {
      const statuses = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] as const;
      for (const status of statuses) {
        const event = {
          type: "status" as const,
          payload: { job_id: "job-123", status },
        };
        expect(SseStatusEventSchema.parse(event)).toEqual(event);
      }
    });

    it("should reject status event with unlisted status string", () => {
      expect(() =>
        SseStatusEventSchema.parse({
          type: "status",
          payload: { job_id: "job-123", status: "UNKNOWN" },
        })
      ).toThrow();
    });
  });

  describe("SseStatisticsEventSchema", () => {
    it("should parse valid statistics event", () => {
      const event = {
        type: "statistics" as const,
        payload: {
          job_id: "job-123",
          generated_tokens: 42,
          tokens_per_second: 15.5,
          time_to_first_token: 0.2,
        },
      };
      expect(SseStatisticsEventSchema.parse(event)).toEqual(event);
    });

    it("should parse statistics event with empty payload fields", () => {
      const event = {
        type: "statistics" as const,
        payload: {
          job_id: "job-123",
        },
      };
      expect(SseStatisticsEventSchema.parse(event)).toEqual(event);
    });
  });

  describe("SseGenericEventSchema", () => {
    it("should parse custom or future unknown events", () => {
      const event = {
        type: "custom_event",
        payload: {
          foo: "bar",
          count: 10,
        },
        timestamp: "2026-07-23T10:00:00.000Z",
      };
      expect(SseGenericEventSchema.parse(event)).toEqual(event);
    });

    it("should parse generic event without payload", () => {
      const event = {
        type: "ping",
      };
      expect(SseGenericEventSchema.parse(event)).toEqual(event);
    });
  });
});
