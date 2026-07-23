import type { Response } from "express";
import bcrypt from "bcryptjs";
import { UserRepository } from "../repositories/user.repository.js";
import { SseService } from "../services/sse.service.js";
import { eventBus } from "../events/eventBus.js";
import type { AuthRequest } from "../middlewares/auth.middleware.js";

export class AdminController {
  static async getUsers(req: AuthRequest, res: Response) {
    const users = await UserRepository.findAll();
    return res.status(200).json(users);
  }

  static async createUser(req: AuthRequest, res: Response) {
    const { email, password, role } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "Email et mot de passe de 6 caractères minimum requis" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await UserRepository.create({ email, password_hash: hash, role });
    return res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at.toISOString(),
      updated_at: user.updated_at.toISOString(),
    });
  }

  static async deleteUser(req: AuthRequest, res: Response) {
    await UserRepository.delete(req.params.id as string);
    return res.status(200).json({ message: "Utilisateur supprimé" });
  }

  static async updateUser(req: AuthRequest, res: Response) {
    const id = req.params.id as string;
    const { email, role, resetPassword } = req.body;

    const updateData: { email?: string; role?: any; password_hash?: string } = {};
    let generatedPassword: string | undefined;

    if (email) updateData.email = email;
    if (role) updateData.role = role;

    if (resetPassword === true) {
      // Génère un mot de passe aléatoire de 12 caractères hex
      const { randomBytes } = await import("node:crypto");
      generatedPassword = randomBytes(6).toString("hex");
      updateData.password_hash = await bcrypt.hash(generatedPassword, 10);
    }

    const user = await UserRepository.update(id, updateData);
    const response: any = {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at.toISOString(),
      updated_at: user.updated_at.toISOString(),
    };
    if (generatedPassword) response.generatedPassword = generatedPassword;

    return res.status(200).json(response);
  }


  static async streamAdminConversation(req: AuthRequest, res: Response) {
    const convId = req.params.id as string;
    const session = await SseService.setupSession(req, res);
    SseService.registerSession(`conv:${convId}`, session);
  }

  // 🔍 Route SSE de Debug Live EventBus API
  static async streamEventBusDebug(req: AuthRequest, res: Response) {
    const session = await SseService.setupSession(req, res);
    
    // Diffusion en direct de TOUS les événements qui traversent l'EventBus
    const unsubscribe = eventBus.subscribeAll((topic, envelope) => {
      (session as any).push({
        topic,
        correlationId: envelope.correlationId,
        payload: envelope.payload,
        timestamp: new Date().toISOString(),
      }, "eventbus.debug");
    });

    req.on("close", () => {
      unsubscribe();
    });
  }
}
