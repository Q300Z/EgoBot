import express from "express";
import cors from "cors";
import helmet from "helmet";
import { LoginRequestSchema, RegisterRequestSchema, CreateMessageRequestSchema } from "@egobot/shared-types";
import { AuthController } from "./controllers/auth.controller.js";
import { MessageController } from "./controllers/message.controller.js";
import { AdminController } from "./controllers/admin.controller.js";
import { authMiddleware, requireAdmin, sseAuthMiddleware } from "./middlewares/auth.middleware.js";
import { authRateLimiter, messageRateLimiter } from "./middlewares/rateLimit.middleware.js";
import { validateRequest } from "./middlewares/validate.middleware.js";
import { env } from "./config/env.js";

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

// Sonde de disponibilité : sans dépendance externe, pour que l'orchestrateur
// puisse distinguer « processus vivant » de « processus planté ».
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// Auth publiques — limiteur de débit et validation Zod : ce sont les seules
// routes atteignables sans jeton.
app.post(
  "/api/v1/auth/login",
  authRateLimiter,
  validateRequest({ body: LoginRequestSchema }),
  AuthController.login,
);
app.post(
  "/api/v1/auth/register",
  authRateLimiter,
  validateRequest({ body: RegisterRequestSchema }),
  AuthController.register,
);

// SSE Client & Debug Live EventBus
app.get("/sse/:jobId", sseAuthMiddleware as any, MessageController.streamJobEvents);
app.get("/sse/v1/admin/conversations/:id", sseAuthMiddleware as any, requireAdmin as any, AdminController.streamAdminConversation);

// Route de debug — uniquement disponible en environnement de développement
if (["dev", "development"].includes(process.env.NODE_ENV ?? "dev")) {
  app.get("/sse/v1/debug/eventbus", sseAuthMiddleware as any, requireAdmin as any, AdminController.streamEventBusDebug);
}

// Routes protégées Utilisateur
app.get("/api/v1/auth/me", authMiddleware as any, AuthController.me);
app.post(
  "/api/v1/messages",
  authMiddleware as any,
  messageRateLimiter,
  validateRequest({ body: CreateMessageRequestSchema }),
  MessageController.createMessage,
);
app.get("/api/v1/conversations", authMiddleware as any, MessageController.getConversations);
app.get("/api/v1/conversations/:id", authMiddleware as any, MessageController.getConversation);
app.delete("/api/v1/conversations/:id", authMiddleware as any, MessageController.deleteConversation);

// Routes d'administration Backoffice
app.get("/api/v1/admin/users", authMiddleware as any, requireAdmin as any, AdminController.getUsers);
app.post("/api/v1/admin/users", authMiddleware as any, requireAdmin as any, AdminController.createUser);
app.put("/api/v1/admin/users/:id", authMiddleware as any, requireAdmin as any, AdminController.updateUser);
app.delete("/api/v1/admin/users/:id", authMiddleware as any, requireAdmin as any, AdminController.deleteUser);
app.get("/api/v1/admin/conversations", authMiddleware as any, requireAdmin as any, AdminController.getConversations);
app.get("/api/v1/admin/conversations/:id", authMiddleware as any, requireAdmin as any, AdminController.getConversation);
app.get("/api/v1/admin/users/:userId/conversations", authMiddleware as any, requireAdmin as any, AdminController.getUserConversations);
