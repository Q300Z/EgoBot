import { describe, it, expect } from "vitest";
import {
  JobStatusSchema,
  JobStatisticsSchema,
  JobSchema,
} from "./job.js";

describe("Job Schemas", () => {
  describe("JobStatusSchema", () => {
    it("should accept all valid job statuses", () => {
      const validStatuses = [
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
        "DEFERRED",
      ];
      for (const status of validStatuses) {
        expect(JobStatusSchema.parse(status)).toBe(status);
      }
    });

    it("should reject invalid status", () => {
      expect(() => JobStatusSchema.parse("RUNNING")).toThrow();
      expect(() => JobStatusSchema.parse("UNKNOWN")).toThrow();
    });
  });

  describe("JobStatisticsSchema", () => {
    const validStats = {
      generated_tokens: 150,
      total_generation_time: 2.5,
      time_to_first_token: 0.12,
      tokens_per_second: 60.0,
    };

    it("should parse valid statistics", () => {
      expect(JobStatisticsSchema.parse(validStats)).toEqual(validStats);
    });

    it("should reject negative numbers", () => {
      expect(() =>
        JobStatisticsSchema.parse({ ...validStats, generated_tokens: -1 })
      ).toThrow();
      expect(() =>
        JobStatisticsSchema.parse({ ...validStats, total_generation_time: -0.5 })
      ).toThrow();
      expect(() =>
        JobStatisticsSchema.parse({ ...validStats, time_to_first_token: -0.1 })
      ).toThrow();
      expect(() =>
        JobStatisticsSchema.parse({ ...validStats, tokens_per_second: -5 })
      ).toThrow();
    });

    it("should reject non-integer generated_tokens", () => {
      expect(() =>
        JobStatisticsSchema.parse({ ...validStats, generated_tokens: 12.5 })
      ).toThrow();
    });
  });

  describe("JobSchema", () => {
    const validJob = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      conversation_id: "223e4567-e89b-12d3-a456-426614174000",
      user_prompt_id: "323e4567-e89b-12d3-a456-426614174000",
      assistant_message_id: "423e4567-e89b-12d3-a456-426614174000",
      model: "llama-3",
      status: "COMPLETED" as const,
      time_to_first_token: 0.05,
      tokens_per_second: 25.0,
      generated_tokens: 100,
      error: null,
      created_at: "2026-07-23T10:00:00.000Z",
      updated_at: "2026-07-23T10:00:00.000Z",
    };

    it("should parse a valid complete job", () => {
      expect(JobSchema.parse(validJob)).toEqual(validJob);
    });

    it("should parse a job with optional null fields omitted or null", () => {
      const minimalJob = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        conversation_id: "223e4567-e89b-12d3-a456-426614174000",
        user_prompt_id: "323e4567-e89b-12d3-a456-426614174000",
        assistant_message_id: "423e4567-e89b-12d3-a456-426614174000",
        model: "llama-3",
        status: "PENDING" as const,
        created_at: "2026-07-23T10:00:00.000Z",
        updated_at: "2026-07-23T10:00:00.000Z",
      };
      expect(JobSchema.parse(minimalJob)).toEqual(minimalJob);
    });

    it("should parse a failed job with error string", () => {
      const failedJob = {
        ...validJob,
        status: "FAILED" as const,
        error: "Model execution timeout",
      };
      expect(JobSchema.parse(failedJob)).toEqual(failedJob);
    });

    it("should reject invalid UUIDs", () => {
      expect(() =>
        JobSchema.parse({ ...validJob, user_prompt_id: "invalid-uuid" })
      ).toThrow();
    });
  });
});
