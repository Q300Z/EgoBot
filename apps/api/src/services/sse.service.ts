import type { Request, Response } from "express";
import { createSession, Session } from "better-sse";
import { eventBus } from "../events/eventBus.js";
import { LoggerFactory } from "../config/logger.js";
import { valkeyStream } from "../config/valkey.js";
import { STREAM_ENV } from "../config/env.js";

const logger = LoggerFactory.getLogger("SseService");

export class SseService {
  private static activeSessions = new Map<string, Set<Session>>();

  static init() {
    eventBus.subscribe("job.token_emitted", (event) => {
      const { jobId, envelope, eventId } = event.payload as any;
      if (!envelope) return;

      const payload = envelope.payload || envelope.data || envelope;
      const conversationId = payload?.conversation_id || payload?.conversationId;

      const jobSessions = this.activeSessions.get(jobId) || new Set<Session>();
      const convSessions = conversationId ? this.activeSessions.get(`conv:${conversationId}`) || new Set<Session>() : new Set<Session>();

      const targetSessions = new Set([...jobSessions, ...convSessions]);

      // Événement SSE poussé sans nom personnalisé (défaut "message") : un nom
      // personnalisé (ex. "job.progress") ne serait jamais reçu par
      // EventSource.onmessage côté navigateur, qui ne réagit qu'à l'event
      // par défaut. Le type sémantique reste disponible dans le payload
      // (kind/status), déjà lu comme tel côté SDK client.
      for (const session of targetSessions) {
        session.push(payload, undefined, eventId);
      }
    });

    logger.info("SseService initialisé.");
  }

  static async setupSession(req: Request, res: Response, jobId?: string): Promise<Session> {
    const session = await createSession(req, res);

    const lastEventId = (req.headers["last-event-id"] as string) || (req.query.lastEventId as string);

    if (lastEventId && jobId) {
      const sseStreamKey = `jobs:sse:${STREAM_ENV}:${jobId}`;
      try {
        const startId = this.incrementStreamId(lastEventId);
        const missedEvents = await valkeyStream.xrange(sseStreamKey, startId, "+");

        logger.info(`[SSE Recovery] Replay de ${missedEvents.length} événement(s) manqué(s) pour le job ${jobId}`);

        for (const [eventId, fields] of missedEvents) {
          let eventData = "";
          for (let i = 0; i < fields.length; i += 2) {
            if (fields[i] === "data") eventData = fields[i + 1];
          }
          if (eventData) {
            const parsed = JSON.parse(eventData);
            const payload = parsed.payload || parsed.data || parsed;
            session.push(payload, undefined, eventId);
          }
        }
      } catch (err) {
        logger.error(`[SSE Recovery] Erreur lors du replay des événements pour ${jobId}`, err);
      }
    }

    return session;
  }

  private static incrementStreamId(id: string): string {
    const parts = id.split("-");
    if (parts.length === 2) {
      return `${parts[0]}-${parseInt(parts[1], 10) + 1}`;
    }
    return id;
  }

  static registerSession(key: string, session: Session) {
    if (!this.activeSessions.has(key)) {
      this.activeSessions.set(key, new Set());
    }
    this.activeSessions.get(key)!.add(session);

    session.on("disconnected", () => {
      this.activeSessions.get(key)?.delete(session);
    });
  }
}
