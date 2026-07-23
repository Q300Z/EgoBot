import Redis from "ioredis";

export interface WorkerTaskContext {
  jobId: string;
  conversationId: string;
  sendToken: (chunk: string) => Promise<void>;
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
