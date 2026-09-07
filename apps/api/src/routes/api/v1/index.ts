import { Router } from "express";
import { authenticateJWT, validate } from "../../../middlewares";
import { AuthController, LoginRequestSchema, RegisterRequestSchema } from "../../../modules/auth";
import { ConversationController, GetConversationSchema } from "../../../modules/conversation";
import { MessageController, PostMessageSchema, CancelMessageSchema } from "../../../modules/message";

import { healthCheckHandler } from "../../health";

const router: Router = Router();

const conversationController = new ConversationController();
const messageController = new MessageController();

// Health Check
router.get("/health", healthCheckHandler);

// Auth
router.post("/auth/login", validate(LoginRequestSchema), AuthController.login);
router.post("/auth/register", validate(RegisterRequestSchema), AuthController.register);
router.get("/auth/me", authenticateJWT, AuthController.getMe);

// Conversations
router.get("/conversations", authenticateJWT, conversationController.getConversations.bind(conversationController));
router.get(
	"/conversations/:id",
	authenticateJWT,
	validate(GetConversationSchema),
	conversationController.getConversation.bind(conversationController),
);
router.delete(
	"/conversations/:id",
	authenticateJWT,
	validate(GetConversationSchema),
	conversationController.deleteConversation.bind(conversationController),
);

// Messages
router.post(
	"/messages",
	authenticateJWT,
	validate(PostMessageSchema),
	messageController.postMessage.bind(messageController),
);
router.post(
	"/messages/:id/cancel",
	authenticateJWT,
	validate(CancelMessageSchema),
	messageController.cancelMessage.bind(messageController),
);

export default router;
