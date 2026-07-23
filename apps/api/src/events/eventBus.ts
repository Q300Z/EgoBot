import { EventEmitter } from "node:events";
import { v4 as uuidv4 } from "uuid";
import { LoggerFactory } from "../config/logger.js";

const logger = LoggerFactory.getLogger("EventBus");

export interface EventEnvelope<T = unknown> {
  correlationId: string;
  payload: T;
  eventId?: string;
}

export class EventBus {
  private bus = new EventEmitter();

  constructor() {
    this.bus.setMaxListeners(1000);
  }

  publish<T = unknown>(topic: string, payload: T, correlationId?: string, eventId?: string): string {
    const corrId = correlationId || uuidv4();
    const envelope: EventEnvelope<T> = { correlationId: corrId, payload, eventId };

    const msg = `[EventBus:Publish] Sujet: "${topic}" | corrId: "${corrId}" | payload: ${JSON.stringify(payload)}`;
    if (topic === "workers:status") {
      logger.debug(msg);
    } else {
      logger.info(msg);
    }

    this.bus.emit(`topic:${topic}`, envelope);
    this.bus.emit("all", topic, envelope);
    return corrId;
  }

  subscribe<T = unknown>(topic: string, callback: (envelope: EventEnvelope<T>) => void): () => void {
    const wrapped = (envelope: EventEnvelope<T>) => {
      const msg = `[EventBus:Deliver] Sujet: "${topic}" | corrId: "${envelope.correlationId}" | payload: ${JSON.stringify(envelope.payload)}`;
      if (topic === "workers:status") {
        logger.debug(msg);
      } else {
        logger.info(msg);
      }
      callback(envelope);
    };

    this.bus.on(`topic:${topic}`, wrapped);
    return () => {
      this.bus.removeListener(`topic:${topic}`, wrapped);
    };
  }

  subscribeAll(callback: (topic: string, envelope: EventEnvelope<any>) => void): () => void {
    const handler = (topic: string, envelope: EventEnvelope<any>) => {
      callback(topic, envelope);
    };
    this.bus.on("all", handler);
    return () => {
      this.bus.removeListener("all", handler);
    };
  }

  request<TReply = any, TPayload = any>(
    commandTopic: string,
    replyTopic: string,
    payload: TPayload,
    timeoutMs: number = 10000
  ): Promise<TReply> {
    return new Promise((resolve, reject) => {
      const corrId = uuidv4();
      let timer: NodeJS.Timeout;

      const unsubscribe = this.subscribe<TReply>(replyTopic, (envelope) => {
        if (envelope.correlationId === corrId) {
          clearTimeout(timer);
          unsubscribe();

          const data = envelope.payload as any;
          if (data && data.error) {
            reject(new Error(data.error));
          } else {
            resolve(envelope.payload);
          }
        }
      });

      timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout EventBus (${timeoutMs}ms) sur le sujet ${commandTopic}`));
      }, timeoutMs);

      this.publish(commandTopic, payload, corrId);
    });
  }
}

export const eventBus = new EventBus();
