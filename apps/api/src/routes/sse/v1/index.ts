import { Router } from "express";
import { MessageController } from "../../../modules/message";

const router: Router = Router();

const messageController = new MessageController();

// Flux SSE
router.get("/job/:jobId", messageController.subscribeJobStream.bind(messageController));

export default router;
