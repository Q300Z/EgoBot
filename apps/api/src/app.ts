import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";

// Middlewares
import { logger as requestLogger, globalErrorHandler } from "./middlewares";

// Modules métier
import { initAuthModule } from "./modules/auth";
import { initConversationModule } from "./modules/conversation";
import { initMessageModule } from "./modules/message";
import { initJobModule } from "./modules/job";

// Routes versionnées
import routes from "./routes";

import { env } from "./config/env";
import { healthCheckHandler } from "./routes/health";

// Initialisation des modules métier
initAuthModule();
initConversationModule();
initMessageModule();
initJobModule();

const app: express.Application = express();

// Configuration des Intergiciels généraux
app.use(express.json({ limit: "10mb" }));
app.use(helmet());
app.set("trust proxy", true);

const allowedOrigins = env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(",").map((s) => s.trim());
app.use(
	cors({
		origin: allowedOrigins,
		credentials: true,
	}),
);
app.use(
	compression({
		filter: (req, res) => {
			if (
				req.headers.accept?.includes("text/event-stream") ||
				req.originalUrl?.includes("/sse") ||
				req.url?.includes("/sse") ||
				req.path?.includes("/sse")
			) {
				return false;
			}
			return compression.filter(req, res);
		},
	}),
);
app.use(requestLogger); // Traçage et log HTTP intégrés

// Vérification de santé (Liveness/Readiness)
app.get("/", (_req, res) => {
	res.send("Egobot API est opérationnelle.");
});
app.get("/health", healthCheckHandler);

// Branchement des routes versionnées (REST & SSE)
app.use("/", routes);

// Gestionnaire d'erreurs global (doit être positionné à la fin)
app.use(globalErrorHandler);

export default app;
