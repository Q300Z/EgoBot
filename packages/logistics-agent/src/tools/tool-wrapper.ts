import type { StructuredToolInterface } from "@langchain/core/tools";
import { ToolMessage } from "@langchain/core/messages";

/**
 * Options de configuration pour le wrapping et la protection d'un outil LangChain.
 */
export interface ToolWrapperOptions {
  /**
   * Timeout maximal en millisecondes autorisé pour l'exécution d'un appel d'outil.
   * Si la promesse de l'outil ne résout pas dans ce délai, une erreur de timeout est levée.
   * @defaultValue 5000
   */
  timeoutMs?: number;
  /**
   * Nombre maximum d'appels autorisés pour cet outil au cours d'une même session ou interaction.
   * Si ce quota est dépassé, l'appel est court-circuité avec un message d'erreur RATE_LIMITED.
   * @defaultValue undefined (aucun rate-limit)
   */
  maxCalls?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Enveloppe une liste d'outils LangChain avec un ensemble de garde-fous de production :
 * 1. **Journalisation structurée** : logue le nom de l'outil, ses arguments en entrée, sa durée d'exécution en ms et son issue (succès ou échec).
 * 2. **Timeout d'exécution configurable** : protège l'agent contre les blocages réseau ou requêtes lentes via `Promise.race`.
 * 3. **Rate-limiting par outil** : limite le nombre d'appels par outil pour éviter les boucles infinies de raisonnement de l'agent.
 * 4. **Conformité au protocole `ToolMessage` de LangChain** : lorsqu'un `tool_call_id` est présent (appels OpenAI/Azure),
 *    renvoie un objet `ToolMessage` avec le statut `error` pour préserver l'intégrité de la séquence de messages du modèle.
 *
 * @template T - Type de l'outil étendant `StructuredToolInterface`.
 * @param tools - Tableau des outils LangChain à envelopper.
 * @param optionsPerTool - Dictionnaire d'options de protection indexé par nom d'outil (`tool.name`).
 * @returns Le tableau des outils enveloppés avec les mécanismes de protection.
 *
 * @example
 * ```typescript
 * const protectedTools = wrapTools(rawTools, {
 *   get_order_status: { maxCalls: 5, timeoutMs: 3000 },
 *   get_customer_profile: { maxCalls: 1 }
 * });
 * ```
 */
export function wrapTools<T extends StructuredToolInterface>(
  tools: T[],
  optionsPerTool?: Record<string, ToolWrapperOptions>,
): T[] {
  const callCounts = new Map<string, number>();

  return tools.map((t) => {
    const opts = optionsPerTool?.[t.name] ?? {};
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxCalls = opts.maxCalls;

    const originalInvoke = t.invoke.bind(t);

    t.invoke = async (input: any, options?: any) => {
      const name = t.name;
      const start = Date.now();
      const toolCallId = input && typeof input === "object" && typeof input.id === "string" ? input.id : undefined;

      // Rate limit
      if (maxCalls !== undefined) {
        const count = (callCounts.get(name) ?? 0) + 1;
        callCounts.set(name, count);
        if (count > maxCalls) {
          const msg = `Limite atteinte : l'outil ${name} ne peut être appelé que ${maxCalls} fois par interaction.`;
          console.warn(`[Tool] ${name} RATE_LIMITED (appel #${count})`);
          const payload = JSON.stringify({ found: false, code: "RATE_LIMITED", message: msg });
          if (toolCallId) {
            return new ToolMessage({
              tool_call_id: toolCallId,
              name,
              content: payload,
              status: "error",
            }) as any;
          }
          return payload;
        }
      }

      // Timeout + logging
      try {
        const result = await Promise.race([
          originalInvoke(input, options),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout: ${name} a dépassé ${timeoutMs}ms`)),
              timeoutMs,
            ),
          ),
        ]);
        console.log(`[Tool] ${name}(${JSON.stringify(input)}) → OK (${Date.now() - start}ms)`);
        return result;
      } catch (err: any) {
        console.error(`[Tool] ${name}(${JSON.stringify(input)}) → ERREUR (${Date.now() - start}ms)`, err?.message || err);
        // Si l'appel fait partie d'un lot ToolCall géré par le modèle, renvoyer un ToolMessage d'erreur
        // pour ne pas corrompre la séquence tool_call_id attendue par OpenAI/Azure
        if (toolCallId) {
          return new ToolMessage({
            tool_call_id: toolCallId,
            name,
            content: JSON.stringify({ found: false, code: "TOOL_ERROR", message: err?.message || String(err) }),
            status: "error",
          }) as any;
        }
        throw err;
      }
    };

    return t;
  });
}
