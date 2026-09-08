import { prisma } from "../config/db";
import { PasswordService } from "../modules/auth/AuthService";
import { LoggerFactory } from "../config/logger";

const logger = LoggerFactory.getLogger("Seed");

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || "admin@egobot.local").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Password123!";
  const username = "admin";

  logger.info(`Génération du compte de test admin (${email})...`);
  const password_hash = await PasswordService.hash(password);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      password_hash,
      role: "ADMIN",
    },
    create: {
      email,
      username,
      password_hash,
      role: "ADMIN",
    },
  });

  logger.info(`✅ Compte admin initialisé avec succès (ID: ${admin.id}, Email: ${admin.email}, Rôle: ${admin.role})`);
}

seedAdmin()
  .catch((err) => {
    logger.error("❌ Erreur lors du seed de l'admin API", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
