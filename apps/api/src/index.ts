import { app } from "./app.js";
import { env } from "./config/env.js";
import { SseService } from "./services/sse.service.js";
import { JobService } from "./services/job.service.js";
import { TacheService } from "./services/tache.service.js";
import { DbService } from "./services/db.service.js";
import { LoggerFactory } from "./config/logger.js";
import { valkeyStream, valkeyReader, valkeyWriter } from "./config/valkey.js";
import { prisma } from "./config/db.js";

const logger = LoggerFactory.getLogger("Server");

async function bootstrap() {
  await DbService.init();

  SseService.init();
  JobService.init();
  TacheService.init();

  const server = app.listen(env.PORT, () => {
    logger.info(`Serveur API démarré sur http://localhost:${env.PORT}`);
  });

  const gracefulShutdown = async (signal: string) => {
    logger.info(`Signal ${signal} reçu. Arrêt propre du serveur API...`);

    server.close(() => {
      logger.info("Serveur HTTP fermé.");
    });

    try {
      await Promise.all([
        valkeyStream.quit(),
        valkeyReader.quit(),
        valkeyWriter.quit(),
        prisma.$disconnect(),
      ]);
      logger.info("Connexions Valkey et Prisma fermées avec succès.");
      process.exit(0);
    } catch (err) {
      logger.error("Erreur lors de la fermeture des ressources", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

bootstrap().catch((err) => {
  logger.error("Erreur fatale lors du démarrage de l'API", err);
  process.exit(1);
});
