import Redis from "ioredis";
import type { SourceType, SourceData } from "@egobot/shared-types";

export interface WorkerTaskContext {
  jobId: string;
  conversationId: string;
  sendToken: (chunk: string) => Promise<void>;
  sendSource: (
    source:
      | { title: string; url?: string; id?: string; type?: SourceType | string }
      | string
  ) => Promise<void>;
  deferJob: (targetModel: string) => Promise<void>;
  checkCancellation: () => Promise<boolean>;
}

export function createWorkerContext(
  jobId: string,
  conversationId: string,
  env: string,
  redisWriter: Redis
): WorkerTaskContext {
  const streamKey = `jobs:sse:${env}:${jobId}`;

  return {
    jobId,
    conversationId,
    sendToken: async (chunk: string) => {
      const envelope = {
        event: "job.progress",
        data: {
          kind: "token",
          status: "IN_PROGRESS",
          job_id: jobId,
          conversation_id: conversationId,
          chunk,
        },
      };
      await redisWriter.xadd(
        streamKey,
        "MAXLEN",
        "~",
        1000,
        "*",
        "event",
        envelope.event,
        "data",
        JSON.stringify(envelope)
      );
      await redisWriter.expire(streamKey, 3600);
    },
    sendSource: async (
      source:
        | { title: string; url?: string; id?: string; type?: SourceType | string }
        | string
    ) => {
      const sourceObj =
        typeof source === "string"
          ? { title: source, type: "doc" }
          : { type: "doc", ...source };
      const marker = `[[source:${JSON.stringify(sourceObj)}]]`;
      const envelope = {
        event: "source",
        data: {
          kind: "source",
          status: "IN_PROGRESS",
          job_id: jobId,
          conversation_id: conversationId,
          chunk: marker,
          source: sourceObj,
        },
      };
      await redisWriter.xadd(
        streamKey,
        "MAXLEN",
        "~",
        1000,
        "*",
        "event",
        envelope.event,
        "data",
        JSON.stringify(envelope)
      );
      await redisWriter.expire(streamKey, 3600);
    },
    deferJob: async (targetModel: string) => {
      const envelope = {
        event: "job.progress",
        data: {
          kind: "token",
          status: "IN_PROGRESS",
          job_id: jobId,
          conversation_id: conversationId,
          chunk: `__DEFER_JOB__:${targetModel}`,
        },
      };
      await redisWriter.xadd(
        streamKey,
        "MAXLEN",
        "~",
        1000,
        "*",
        "event",
        envelope.event,
        "data",
        JSON.stringify(envelope)
      );
      await redisWriter.expire(streamKey, 3600);
    },
    checkCancellation: async () => {
      const cancelKey = `jobs:cancel:${jobId}`;
      const exists = await redisWriter.exists(cancelKey);
      return exists === 1;
    },
  };
}
