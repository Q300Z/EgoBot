import { execSync } from "node:child_process";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db.js";
import { LoggerFactory } from "../config/logger.js";

const logger = LoggerFactory.getLogger("DbService");

export class DbService {
  public static async init() {
    try {
      logger.info("Vérification de l'initialisation de la base de données (Dev / Prod)...");

      let tablesExist = false;
      try {
        await prisma.user.count();
        tablesExist = true;
      } catch (err) {
        logger.warn("Les tables n'existent pas encore. Tentative de création du schéma SQLite...");
      }

      if (!tablesExist) {
        try {
          const cwd = process.cwd();
          const apiDir = cwd.endsWith("api") ? cwd : path.join(cwd, "apps/api");
          execSync("npx prisma db push --accept-data-loss --skip-generate", {
            cwd: apiDir,
            stdio: "ignore",
            env: process.env,
          });
          logger.info("Schéma Prisma appliqué via 'prisma db push'.");
        } catch (pushErr) {
          logger.warn("Prisma CLI indisponible pour db push, exécution manuelle DDL SQLite...");
          await DbService.applyFallbackDdl();
        }
      }

      // Initialisation des données de démarrage (Compte admin par défaut si aucun administrateur n'existe)
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN" },
      });

      if (adminCount === 0) {
        logger.info("Création du compte administrateur initial (admin@egobot.com)...");
        const passwordHash = await bcrypt.hash("admin123", 10);
        await prisma.user.create({
          data: {
            email: "admin@egobot.com",
            password_hash: passwordHash,
            role: "ADMIN",
          },
        });
        logger.info("Compte administrateur initial créé avec succès : admin@egobot.com / admin123");
      }

      logger.info("Base de données opérationnelle.");
    } catch (error) {
      logger.error("Échec de l'initialisation de la base de données", error);
      throw error;
    }
  }

  private static async applyFallbackDdl() {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "email" TEXT NOT NULL,
          "password_hash" TEXT NOT NULL,
          "role" TEXT NOT NULL DEFAULT 'USER',
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Conversation" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "user_id" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "model" TEXT NOT NULL DEFAULT 'CHATBOT',
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL,
          "deleted_at" DATETIME,
          CONSTRAINT "Conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Message" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "conversation_id" TEXT NOT NULL,
          "role" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "Message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Job" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "conversation_id" TEXT NOT NULL,
          "user_prompt_id" TEXT NOT NULL,
          "assistant_message_id" TEXT NOT NULL,
          "model" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "time_to_first_token" REAL,
          "tokens_per_second" REAL,
          "generated_tokens" INTEGER,
          "error" TEXT,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL,
          "started_at" DATETIME,
          "ended_at" DATETIME,
          CONSTRAINT "Job_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "Job_user_prompt_id_fkey" FOREIGN KEY ("user_prompt_id") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "Job_assistant_message_id_fkey" FOREIGN KEY ("assistant_message_id") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    logger.info("DDL de secours exécuté avec succès.");
  }
}
