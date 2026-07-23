import { LoggerFactory } from "../config/logger.js";
import { JobService } from "./job.service.js";

const logger = LoggerFactory.getLogger("TacheService");

export class TacheService {
  private static interval: NodeJS.Timeout | null = null;

  static init() {
    this.startCronTasks();
    logger.info("TacheService initialisé (Tâches crons de fond).");
  }

  private static startCronTasks() {
    // Vérification toutes les 5 minutes des jobs bloqués
    this.interval = setInterval(() => {
      JobService.handleStuckJobsVerifier().catch((err: any) =>
        logger.error("Erreur vérification jobs bloqués", err)
      );
    }, 5 * 60 * 1000);
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
