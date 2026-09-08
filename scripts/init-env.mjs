#!/usr/bin/env node

/**
 * Script d'initialisation de l'environnement EgoBot
 * - Copie .env.example vers .env à la racine si inexistant
 * - Génère un JWT_SECRET fort de 48 caractères si la valeur est celle par défaut
 * - Crée ou synchronise les .env locaux pour apps/api, apps/worker et packages/logistics-agent
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const rootEnvPath = path.join(rootDir, ".env");
const rootEnvExamplePath = path.join(rootDir, ".env.example");

console.log("🚀 Initialisation de l'environnement EgoBot...");

if (!fs.existsSync(rootEnvPath)) {
  if (fs.existsSync(rootEnvExamplePath)) {
    let content = fs.readFileSync(rootEnvExamplePath, "utf-8");
    // Générer un secret aléatoire fort de 48 caractères (base64)
    const randomSecret = crypto.randomBytes(36).toString("base64");
    content = content.replace(
      /JWT_SECRET=super_secret_jwt_key_for_dev_environment_at_least_32_chars/g,
      `JWT_SECRET=${randomSecret}`
    );
    content = content.replace(
      /SECRET_KEY=super_secret_jwt_key_for_dev_environment_at_least_32_chars/g,
      `SECRET_KEY=${randomSecret}`
    );
    fs.writeFileSync(rootEnvPath, content, "utf-8");
    console.log("✅ Fichier .env racine créé à partir de .env.example (avec un JWT_SECRET généré).");
  } else {
    console.error("❌ Impossible de trouver .env.example à la racine !");
    process.exit(1);
  }
} else {
  console.log("ℹ️  Le fichier .env racine existe déjà. Préservation des valeurs existantes.");
}

// Synchroniser des copies/liens locaux pour la compatibilité avec Prisma Studio et outils IDE
const subProjects = [
  "apps/api",
  "apps/worker",
  "packages/logistics-agent",
];

for (const sub of subProjects) {
  const subEnv = path.join(rootDir, sub, ".env");
  const subEnvExample = path.join(rootDir, sub, ".env.example");

  if (!fs.existsSync(subEnv)) {
    if (fs.existsSync(subEnvExample)) {
      fs.copyFileSync(subEnvExample, subEnv);
      console.log(`✅ Fichier ${sub}/.env initialisé depuis son exemple.`);
    } else {
      // Si pas de .env.example local, copier le .env racine
      fs.copyFileSync(rootEnvPath, subEnv);
      console.log(`✅ Fichier ${sub}/.env créé depuis le .env racine.`);
    }
  }
}

console.log("\n🎉 Environnement initialisé avec succès !");
console.log("👉 Lancez maintenant 'pnpm dev' pour démarrer la stack complète.\n");
