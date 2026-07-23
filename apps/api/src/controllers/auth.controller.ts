import type { Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserRepository } from "../repositories/user.repository.js";
import { env } from "../config/env.js";
import type { AuthRequest } from "../middlewares/auth.middleware.js";

export class AuthController {
  static async login(req: AuthRequest, res: Response) {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Champs email et mot de passe requis" });
    }

    const user = await UserRepository.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.JWT_SECRET, { expiresIn: "7d" });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      },
    });
  }

  static async register(req: AuthRequest, res: Response) {
    const { email, password, role } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "Email et mot de passe de 6 caractères minimum requis" });
    }

    const existing = await UserRepository.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "Un compte avec cet email existe déjà" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await UserRepository.create({ email, password_hash: hash, role: role || "USER" });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.JWT_SECRET, { expiresIn: "7d" });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      },
    });
  }

  static async me(req: AuthRequest, res: Response) {
    const user = await UserRepository.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    return res.status(200).json({
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at.toISOString(),
      updated_at: user.updated_at.toISOString(),
    });
  }
}
