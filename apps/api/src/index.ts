import app from "./app";
import { env, getAppEnv } from "./config/env";
import { LoggerFactory } from "./config/logger";
import { prisma } from "./config/db";
import { connectRedisClients } from "./config/redis";
import { SseService } from "./core/sse";
import { redisStreamBus } from "./core/stream";
import { startJobScheduler, stopJobModule } from "./modules/job";
import type { Server } from "http";

const logger = LoggerFactory.getLogger("App");
let server: Server;

async function bootstrap() {
	try {
		// 1. Connexions Redis (Pools multiples)
		await connectRedisClients();

		// 2. Initialisation du service SSE
		SseService.init();

		// 3. Démarrage des planificateurs d'arrière-plan et du bus Redis Streams
		redisStreamBus.start();
		startJobScheduler();

		// 4. Lancement de l'écoute HTTP
		server = app.listen(env.PORT, "0.0.0.0", () => {
			// Le préfixe de file est affiché explicitement : il doit être identique
			// côté worker, qui l'affiche lui aussi à son démarrage. En cas
			// d'écart, l'API publie dans une file que personne ne consomme — sans
			// erreur ni trace, les messages restent simplement sans réponse.
			logger.info(
				`Serveur démarré en mode [${env.NODE_ENV}] sur http://0.0.0.0:${env.PORT} ` +
					`(files jobs:queue:${getAppEnv()}:*)`,
			);
		});

		/**
		 * Procédure de fermeture propre (Graceful Shutdown).
		 */
		const shutdown = async (signal: string) => {
			logger.info(`Signal ${signal} reçu. Fermeture de l'application...`);
			try {
				redisStreamBus.stop();
				stopJobModule();
				await prisma.$disconnect();
				logger.info("Connexions DB, planificateurs et polling arrêtés avec succès.");
			} catch (err) {
				logger.error("Erreur lors de l'arrêt des services de fond", err);
			}

			if (server) {
				server.close(() => {
					logger.info("Serveur HTTP arrêté. Sortie du processus.");
					process.exit(0);
				});
			} else {
				process.exit(0);
			}
		};

		// Capture des signaux d'arrêt système
		process.on("SIGINT", () => void shutdown("SIGINT"));
		process.on("SIGTERM", () => void shutdown("SIGTERM"));
	} catch (error) {
		logger.error("Échec critique du démarrage de l'application :", error);
		try {
			await prisma.$disconnect();
		} catch {}
		process.exit(1);
	}
}

// Lancement du bootstrap
void bootstrap();
