import express from "express";
import cors from "cors";
import helmet from "helmet";
import { AuthController } from "./controllers/auth.controller.js";
import { MessageController } from "./controllers/message.controller.js";
import { AdminController } from "./controllers/admin.controller.js";
import { authMiddleware, requireAdmin, sseAuthMiddleware } from "./middlewares/auth.middleware.js";

export const app = express();

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Auth publiques
app.post("/api/v1/auth/login", AuthController.login);
app.post("/api/v1/auth/register", AuthController.register);

// SSE Client & Debug Live EventBus
app.get("/sse/v1/job/:jobId", sseAuthMiddleware as any, MessageController.streamJobEvents);
app.get("/sse/v1/admin/conversations/:id", sseAuthMiddleware as any, requireAdmin as any, AdminController.streamAdminConversation);

// Route de debug — uniquement disponible en environnement de développement
if (["dev", "development"].includes(process.env.NODE_ENV ?? "dev")) {
  app.get("/sse/v1/debug/eventbus", sseAuthMiddleware as any, requireAdmin as any, AdminController.streamEventBusDebug);
}

// Routes protégées Utilisateur
app.get("/api/v1/auth/me", authMiddleware as any, AuthController.me);
app.post("/api/v1/messages", authMiddleware as any, MessageController.createMessage);
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
