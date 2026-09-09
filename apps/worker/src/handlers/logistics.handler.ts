import { createLogisticsAgent } from "@egobot/logistics-agent/agent";
import type { LogisticsPrismaClient } from "@egobot/logistics-agent/database";
import { CustomerQueryService } from "@egobot/logistics-agent/services";
import type { TaskHandler } from "@egobot/sdk/worker";
import { buildRichContentBlock, getToolSource } from "../rich-content/build-rich-content-block.js";

export interface LogisticsHandlerDeps {
  /**
   * Factory appelée à chaque job (pas à l'enregistrement de la tâche), pour
   * ne créer/résoudre le client Prisma logistique qu'au moment où un job
   * LOGISTICS arrive réellement — évite de faire planter le worker au
   * démarrage si DATABASE_URL est absent alors qu'aucun job logistique n'a
   * encore été reçu.
   */
  getPrisma: () => LogisticsPrismaClient;
  /** Injectable pour les tests : évite d'appeler un vrai LLM. */
  createAgent?: typeof createLogisticsAgent;
}

export function createLogisticsHandler({
  getPrisma,
  createAgent = createLogisticsAgent,
}: LogisticsHandlerDeps): TaskHandler {
  return async (payload, ctx) => {
    // La protection couvre TOUT le handler, y compris l'ouverture de la base et
    // la résolution d'identité. Une première version ne protégeait que l'appel
    // au modèle : une base logistique absente ou non migrée faisait alors
    // échouer resolve() en amont, sans qu'aucun fragment ne soit émis. Le
    // worker relançait trois fois puis abandonnait en file de rebut, et
    // l'utilisateur restait devant une bulle vide, sans rien à diagnostiquer.
    try {
      const prisma = getPrisma();
      // L'enveloppe de job d'apps/api imbrique prompt/email sous `data`
      // (JobStreamHandler.publishToInferenceQueue XADD eventPayload.data tel
      // quel) ; `customer.email`/`prompt` à plat sont conservés en repli pour
      // tout appelant plus simple (scripts, tests).
      const email: string | undefined = payload?.customer?.email || payload?.data?.email;
      const prompt: string = payload?.prompt || payload?.data?.prompt || "";

      // Résolution centralisée (identité manquante, client introuvable ou
      // inactif) : messages dédiés par cas, cohérents avec le reste de
      // l'écosystème logistics-agent.
      const resolution = await new CustomerQueryService(prisma).resolve({ email });
      if (!resolution.resolved) {
        await ctx.sendToken(resolution.message);
        return;
      }

      if (!prompt) {
        await ctx.sendToken("Merci de préciser votre question.");
        return;
      }

      const agent = createAgent({ customer: resolution.customer, prisma });

      const run = await agent.streamEvents(
        { messages: [{ role: "user", content: prompt }] },
        { version: "v3" },
      );

      const detectedSources: Array<NonNullable<ReturnType<typeof getToolSource>>> = [];
      const seenTitles = new Set<string>();

      await Promise.all([
        (async () => {
          for await (const msg of run.messages) {
            for await (const token of msg.text) {
              if (await ctx.checkCancellation()) return;
              await ctx.sendToken(token);
            }
          }
        })(),
        (async () => {
          for await (const call of run.toolCalls) {
            const output = await call.output;
            const block = buildRichContentBlock(call.name, output);
            if (block) {
              await ctx.sendToken(block);
            }
            const source = getToolSource(call.name, output);
            if (source && !seenTitles.has(source.title)) {
              seenTitles.add(source.title);
              detectedSources.push(source);
            }
          }
        })(),
      ]);

      // À la fin du message, afficher les sources utilisées avec mise en page soignée
      if (detectedSources.length > 0 && !(await ctx.checkCancellation())) {
        await ctx.sendToken("\n\n---\n**Sources consultées :** ");
        for (const source of detectedSources) {
          await ctx.sendSource(source);
          await ctx.sendToken(" ");
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[Worker LOGISTICS] Échec du job ${ctx.jobId} :`, error);

      // Cas de loin le plus fréquent en développement, et le plus opaque :
      // le client de chat lève dès sa construction quand aucune clé n'est
      // fournie, avant même le premier appel réseau.
      const missingKey = /api key|apikey|401|unauthorized/i.test(detail);

      await ctx.sendToken(
        missingKey
          ? "Le service de génération n'est pas configuré : la clé API du modèle est absente ou invalide. " +
              "Renseignez la configuration du modèle dans apps/worker/.env."
          : `Le traitement de votre demande a échoué : ${detail}`,
      );
    }
  };
}
