import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { JobRepository } from "../repositories/job.repository.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Accès non autorisé" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Jeton JWT invalide ou expiré" });
  }
}

/**
 * Authentification des flux SSE.
 *
 * `EventSource` ne permet pas d'envoyer d'en-tête HTTP : le jeton transite donc
 * par la query string, comme le font déjà les flux d'administration.
 *
 * L'implémentation précédente retombait, à défaut de jeton valide, sur une
 * vérification de l'existence du jobId, et fabriquait alors un `req.user` à
 * partir du propriétaire de la conversation. Autrement dit, connaître un jobId
 * suffisait à lire le flux d'un autre utilisateur — or un jobId est un
 * identifiant, pas un secret : il est renvoyé dans `stream_url` et se retrouve
 * dans les journaux. Ce repli est supprimé.
 */
export async function sseAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = (req.query?.token as string) || req.headers?.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, error: "Accès non autorisé" });
  }

  let decoded: { id: string; email: string; role: string };
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as any;
  } catch (err) {
    return res.status(401).json({ success: false, error: "Jeton JWT invalide ou expiré" });
  }
  req.user = decoded;

  // Les routes d'administration n'exposent pas de jobId : requireAdmin prend
  // le relais juste après.
  const jobId = req.params.jobId as string | undefined;
  if (!jobId) {
    return next();
  }

  try {
    const job = await JobRepository.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job introuvable" });
    }

    const conversation = await ConversationRepository.findById(job.conversation_id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: "Conversation introuvable" });
    }

    if (conversation.user_id !== decoded.id && decoded.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "Ce job ne vous appartient pas" });
    }

    return next();
  } catch (err) {
    return res.status(500).json({ success: false, error: "Erreur de vérification d'accès au flux" });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ success: false, error: "Accès réservé aux administrateurs" });
  }
  next();
}
