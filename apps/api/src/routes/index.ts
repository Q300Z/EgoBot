import { Router } from "express";
import apiV1Router from "./api/v1";
import apiV2Router from "./api/v2";
import sseV1Router from "./sse/v1";
import sseV2Router from "./sse/v2";

import { healthRouter } from "./health";

const router: Router = Router();

// Health Check
router.use("/health", healthRouter);

// Versioning routes API (REST)
router.use("/api/v1", apiV1Router);
router.use("/v1", apiV1Router);

router.use("/api/v2", apiV2Router);
router.use("/v2", apiV2Router);

// Versioning routes SSE (Flux)
router.use("/sse/v1", sseV1Router);
router.use("/v1", sseV1Router); // app.get("/v1/job/:jobId") et app.get("/v1/status")

router.use("/sse/v2", sseV2Router);
router.use("/v2", sseV2Router);

export default router;
