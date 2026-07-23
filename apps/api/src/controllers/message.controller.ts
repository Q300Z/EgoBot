import type { Response } from "express";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import { JobService } from "../services/job.service.js";
import { SseService } from "../services/sse.service.js";
import type { AuthRequest } from "../middlewares/auth.middleware.js";

export class MessageController {
  static async createMessage(req: AuthRequest, res: Response) {
    const { prompt, conversation_id, model } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt requis" });
    }

    const jobResult = await JobService.createJob(req.user!.id, prompt, conversation_id, model, {
      email: req.user!.email,
    });
    return res.status(201).json(jobResult);
  }

  static async getConversations(req: AuthRequest, res: Response) {
    const conversations = await ConversationRepository.findByUserId(req.user!.id);
    return res.status(200).json(conversations);
  }

  static async getConversation(req: AuthRequest, res: Response) {
    const conversation = await ConversationRepository.findById(req.params.id as string);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation non trouvée" });
    }
    return res.status(200).json(conversation);
  }

  static async deleteConversation(req: AuthRequest, res: Response) {
    await ConversationRepository.softDelete(req.params.id as string);
    return res.status(200).json({ message: "Conversation supprimée" });
  }

  static async streamJobEvents(req: AuthRequest, res: Response) {
    const jobId = req.params.jobId as string;
    const session = await SseService.setupSession(req, res, jobId);
    SseService.registerSession(jobId, session);
  }
}
