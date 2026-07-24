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
 * Middleware SSE sécurisé utilisant le jobId unique comme ticket d'accès naturel.
 */
export async function sseAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const jobId = req.params.jobId as string;
  const token = (req.query?.token as string) || (req.headers?.authorization?.split(" ")[1]);

  // Si un token JWT est fourni, on valide l'identité
  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      req.user = decoded;
      return next();
    } catch (e) {
      // Poursuite de la vérification par Job ID
    }
  }

  // Sinon, on vérifie que le Job ID existe en BDD et autorise l'accès au flux unique du job
  if (jobId) {
    try {
      const job = await JobRepository.findById(jobId);
      if (job) {
        const conversation = await ConversationRepository.findById(job.conversation_id);
        if (conversation) {
          req.user = { id: conversation.user_id, email: "", role: "USER" };
          return next();
        }
      }
    } catch (err) {
      // Ignorer
    }
  }

  return res.status(401).json({ success: false, error: "Accès SSE refusé (Job ID invalide)" });
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ success: false, error: "Accès réservé aux administrateurs" });
  }
  next();
}
