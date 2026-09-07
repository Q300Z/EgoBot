import { Router } from "express";
import { MessageController } from "../../../modules/message";
import { WorkerController } from "../../../modules/worker";
import { AdminController } from "../../../modules/admin";

const router: Router = Router();

const messageController = new MessageController();
const workerController = new WorkerController();
const adminController = new AdminController();

// Flux SSE
router.get("/job/:jobId", messageController.subscribeJobStream.bind(messageController));
router.get("/status", workerController.subscribeStatus.bind(workerController));
router.get("/admin/conversations/:id", adminController.streamAdminConversationEvents.bind(adminController));

export default router;
