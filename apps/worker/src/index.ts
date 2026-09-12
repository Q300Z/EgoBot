import { createPrismaClient, type LogisticsPrismaClient } from "@egobot/logistics-agent/database";
import { WorkerApplication } from "@egobot/sdk/worker";
import dotenv from "dotenv";
import { createLogisticsHandler } from "./handlers/logistics.handler.js";

import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Remonte récursivement l'arborescence des dossiers à partir de `startDir`
 * à la recherche d'un fichier donné (tel que `.env`).
 *
 * @param fileName - Nom du fichier recherché.
 * @param startDir - Dossier de départ de la recherche.
 * @returns Le chemin absolu du fichier trouvé ou `null` s'il n'existe pas.
 */
function findUp(fileName: string, startDir: string): string | null {
  let currentDir = startDir;
  while (true) {
    const candidate = path.join(currentDir, fileName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) return null;
    currentDir = parent;
  }
}

// 1. Charger le .env local d'abord (sans écraser les variables Docker/système)
dotenv.config();

// 2. Charger le .env racine pour les variables globales manquantes
const rootEnv = findUp(".env", path.dirname(__dirname)) ?? findUp(".env", process.cwd());
if (rootEnv && fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}

/**
 * Normalise la valeur de l'environnement en `"dev"` ou `"prod"`.
 *
 * Doit produire exactement les mêmes valeurs ("dev" | "prod") que
 * `normalizeNodeEnv` dans `apps/api/src/config/env.ts` : les clés de file Redis
 * (`jobs:queue:<env>:<model>`) sont construites des deux côtés à partir de
 * cette valeur, un écart silencieux ferait que les jobs ne seraient plus jamais
 * consommés par aucun worker.
 *
 * @param val - Chaîne représentant l'environnement (ex: process.env.NODE_ENV).
 * @returns `"dev"` ou `"prod"`.
 */
function normalizeNodeEnv(val: string | undefined): "dev" | "prod" {
  const lower = val?.trim().toLowerCase();
  if (lower === "development" || lower === "dev" || lower === "test") return "dev";
  return "prod";
}

/**
 * Résout l'environnement d'exécution du worker en tenant compte du mode dev explicite (`DEV_MODE=true`)
 * ou de la variable `NODE_ENV`.
 *
 * @returns `"dev"` ou `"prod"`.
 */
function resolveWorkerEnv(): "dev" | "prod" {
  const isDevMode = process.env.DEV_MODE === "true";
  return isDevMode || normalizeNodeEnv(process.env.NODE_ENV) === "dev" ? "dev" : "prod";
}

const workerEnv = resolveWorkerEnv();

const worker = new WorkerApplication({
  workerId: "ts-worker-1",
  models: ["CHATBOT", "LOGISTICS"],
  env: workerEnv,
  redisUrl: process.env.VALKEY_URL || process.env.REDIS_URL || "redis://localhost:6379",
});

worker.registerTask("CHATBOT", async (payload, ctx) => {
  const prompt = (payload.prompt || payload.data?.prompt || "").trim();
  const lower = prompt.toLowerCase();
  console.log(`[Worker TS] Prompt reçu pour le job ${ctx.jobId} : "${prompt}"`);

  const streamWords = async (text: string, delayMs = 30) => {
    const tokens = text.split(/(\s+)/);
    for (const token of tokens) {
      if (await ctx.checkCancellation()) return false;
      await ctx.sendToken(token);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
    return true;
  };

  // 1. Démo Graphique Chart.js
  if (lower.includes("chart") || lower.includes("graph")) {
    await streamWords("Voici la répartition des stocks pour l'article demandé en temps réel :\n\n");
    const chartData = {
      type: "bar",
      title: "Disponibilité par statut — SKU-00042 (Cartons M)",
      labels: ["En stock (physique)", "Réservé (commandes)", "Disponible à la vente"],
      datasets: [
        {
          label: "Entrepôt Paris-A01",
          data: [450, 95, 355],
        },
      ],
    };
    await ctx.sendToken("\n```chart\n" + JSON.stringify(chartData, null, 2) + "\n```\n");
    await streamWords("\nLe stock disponible est suffisant pour couvrir les expéditions prévues aujourd'hui.\n");
    await ctx.sendSource({
      title: "Table StockItem (SQLite)",
      type: "database",
    });
    return;
  }

  // 2. Démo Diagramme Mermaid
  if (lower.includes("mermaid") || lower.includes("livraison") || lower.includes("suivi")) {
    await streamWords("Voici l'état d'acheminement de la livraison **LIV-2026-000042** :\n\n");
    const mermaidCode = [
      "stateDiagram-v2",
      "    PLANNED --> PREPARING: Prise en charge",
      "    PREPARING --> READY: Colis scellé",
      "    READY --> IN_TRANSIT: Pris en charge transporteur",
      "    IN_TRANSIT --> DELIVERED: Remis au destinataire",
      "    note right of IN_TRANSIT: Étape actuelle (En cours de livraison)",
    ].join("\n");
    await ctx.sendToken("\n```mermaid\n" + mermaidCode + "\n```\n");
    await streamWords("\nTransporteur : **Colissimo** (N° de suivi `6A12345678901`). Livraison estimée le 08/09/2026.\n");
    await ctx.sendSource({
      title: "API Transporteur Colissimo",
      url: "https://laposte.fr",
      type: "api",
    });
    return;
  }

  // 3. Démo Tableau Markdown GFM
  if (lower.includes("table") || lower.includes("commande")) {
    await streamWords("Voici la liste de vos dernières commandes enregistrées :\n\n");
    const tableText = [
      "| N° Commande | Date | Statut | Articles | Total TTC |",
      "| :--- | :--- | :--- | :--- | :--- |",
      "| `CMD-2026-000042` | 04/09/2026 | **Livrée** | 25 cartons taille M | 145,00 € |",
      "| `CMD-2026-000067` | 06/09/2026 | *En préparation* | 10 rouleaux film | 89,50 € |",
      "| `CMD-2026-000091` | 07/09/2026 | *Confirmée* | 2 transpalettes | 520,00 € |",
      "",
    ].join("\n");
    await streamWords(tableText);
    await ctx.sendSource({
      title: "Extrait Facturation & Commandes",
      type: "doc",
    });
    return;
  }

  // 4. Démo Puces de sources interactives
  if (lower.includes("source")) {
    await streamWords("Cette réponse illustre les différents types de puces de sources gérées par le composant :\n\n");
    await ctx.sendSource({ title: "Documentation officielle", url: "https://egobot.local/docs/overview", type: "doc" });
    await ctx.sendSource({ title: "Base de données SQLite", type: "database" });
    await ctx.sendSource({ title: "API Externe Transport", url: "https://egobot.local/api/carriers", type: "api" });
    await ctx.sendSource({ title: "Site web logistique", url: "https://egobot.local", type: "web" });
    await ctx.sendSource({ title: "Fichier contrat_client.pdf", type: "file" });
    return;
  }

  // 5. Démo complète (tout combiné)
  if (lower.includes("demo")) {
    await streamWords("### Démonstration multi-formats EgoBot\n\nVoici un récapitulatif complet :\n\n");
    
    // Tableau
    await streamWords("| Réf | Article | Stock dispo |\n| :--- | :--- | :--- |\n| SKU-01 | Carton M | 350 |\n| SKU-02 | Film étirable | 140 |\n\n");
    
    // Graphique
    const chartData = {
      type: "bar",
      title: "Stocks comparés",
      labels: ["Carton M", "Film étirable", "Palettes"],
      datasets: [{ label: "Unités", data: [350, 140, 85] }],
    };
    await ctx.sendToken("\n```chart\n" + JSON.stringify(chartData, null, 2) + "\n```\n\n");
    
    // Diagramme
    await ctx.sendToken("\n```mermaid\nstateDiagram-v2\n    COMMANDE --> EXPEDITION\n    EXPEDITION --> LIVRAISON\n```\n\n");
    
    // Sources
    await ctx.sendSource({ title: "Manuel Duhamel Logistique", url: "https://egobot.local/docs/logistics", type: "doc" });
    await ctx.sendSource({ title: "Inventaire WMS", type: "database" });
    return;
  }

  // Réponse par défaut
  const defaultWords = [
    "Bonjour", " !", " Je", " suis", " le", " worker", " d'inférence", " EgoBot", ".",
    " Vous", " pouvez", " tester", " les", " différents", " rendus", " visuels", " en",
    " tapant", " les", " mots-clés", " :",
    " `chart`", " (graphique),",
    " `mermaid`", " (diagramme),",
    " `table`", " (tableau),",
    " `sources`", " (puces),",
    " ou", " `demo`", " (vue d'ensemble)."
  ];

  for (const word of defaultWords) {
    if (await ctx.checkCancellation()) return;
    await ctx.sendToken(word);
    await new Promise((r) => setTimeout(r, 60));
  }

  await ctx.sendSource({
    title: "Guide de démonstration EgoBot",
    url: "https://egobot.local/docs/guide",
    type: "doc",
  });
});

let logisticsPrisma: LogisticsPrismaClient | undefined;

/**
 * Fournit l'instance singleton du client Prisma connecté à la BDD logistique SQLite.
 *
 * La connexion n'est établie de façon paresseuse (lazy) qu'à la première invocation,
 * évitant d'exiger les variables de BDD si le worker ne traite que des tâches CHATBOT.
 *
 * @returns Instance singleton de `LogisticsPrismaClient`.
 */
function getLogisticsPrisma(): LogisticsPrismaClient {
  if (!logisticsPrisma) {
    logisticsPrisma = createPrismaClient(process.env.LOGISTICS_DATABASE_URL || process.env.DATABASE_URL);
  }
  return logisticsPrisma;
}

worker.registerTask("LOGISTICS", createLogisticsHandler({ getPrisma: getLogisticsPrisma }));

worker.start();

/**
 * Gère l'arrêt propre (graceful shutdown) du worker :
 * arrêt du polling, désenregistrement des timers et déconnexion de Valkey/Redis.
 *
 * @param signal - Nom du signal système reçu (ex: SIGTERM, SIGINT).
 */
const gracefulShutdownWorker = (signal: string) => {
  console.info(`[Worker TS] Signal ${signal} reçu. Fermeture du worker...`);
  worker.stop();
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdownWorker("SIGTERM"));
process.on("SIGINT", () => gracefulShutdownWorker("SIGINT"));
