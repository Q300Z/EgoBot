import Redis from "ioredis";
import { type SourceType, type SourceData, SourceDataSchema } from "@egobot/shared-types";

/**
 * Contexte opérationnel injecté dans chaque exécution de tâche (`TaskHandler`).
 * Fournit l'accès aux identifiants du job et aux méthodes de communication temps réel.
 */
export interface WorkerTaskContext {
  /** Identifiant unique du job en cours de traitement. */
  jobId: string;
  /** Identifiant de la conversation rattachée au job. */
  conversationId: string;
  /**
   * Émet un fragment de texte (token) vers le client connecté via SSE.
   *
   * @param chunk - Morceau de texte produit par le modèle de langage ou le handler.
   */
  sendToken: (chunk: string) => Promise<void>;
  /**
   * Émet une métadonnée de source (citation) consultée durant l'inférence.
   * L'interface web EgoBot affiche ces sources sous forme de puces interactives avec icônes.
   *
   * @param source - Objet source décrivant le document, l'API ou la base de données consultée.
   */
  sendSource: (
    source: { title: string; type: SourceType; url?: string; id?: string } | SourceData
  ) => Promise<void>;
  /**
   * Délègue / re-route ce job vers un autre modèle d'inférence.
   *
   * @param targetModel - Nom du modèle cible auquel déléguer la requête.
   */
  deferJob: (targetModel: string) => Promise<void>;
  /**
   * Vérifie si le client a demandé l'annulation du job en cours (bouton stop ou fermeture navigateur).
   * Doit être interrogé régulièrement dans les boucles de génération pour interrompre l'inférence rapidement.
   *
   * @returns `true` si le job a été annulé par l'utilisateur, `false` sinon.
   */
  checkCancellation: () => Promise<boolean>;
}

/**
 * Crée un contexte d'exécution `WorkerTaskContext` pour un job donné.
 *
 * @param jobId - Identifiant unique du job.
 * @param conversationId - Identifiant de la conversation.
 * @param env - Environnement d'exécution (`"dev"` ou `"prod"`).
 * @param redisWriter - Client Redis pour l'écriture des événements SSE.
 * @returns Instance implémentant `WorkerTaskContext`.
 */
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
      source: { title: string; type: SourceType; url?: string; id?: string } | SourceData
    ) => {
      const sourceObj = SourceDataSchema.parse(source);
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
      // Supporte à la fois "job:cancel:<jobId>" (émis par l'API Express) et "jobs:cancel:<jobId>"
      const exists = await redisWriter.exists(`job:cancel:${jobId}`, `jobs:cancel:${jobId}`);
      return exists > 0;
    },
  };
}
