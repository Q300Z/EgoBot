import { createLogisticsAgent } from "@egobot/logistics-agent/agent";
import type { LogisticsPrismaClient } from "@egobot/logistics-agent/database";
import { CustomerQueryService } from "@egobot/logistics-agent/services";
import type { TaskHandler } from "@egobot/sdk/worker";
import { buildRichContentBlock } from "../rich-content/build-rich-content-block.js";

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

    const agent = createAgent({ customer: resolution.customer, prisma });

    const run = await agent.streamEvents(
      { messages: [{ role: "user", content: prompt }] },
      { version: "v3" },
    );

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
        }
      })(),
    ]);
  };
}
