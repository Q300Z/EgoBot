import type { StructuredToolInterface } from "@langchain/core/tools";

export interface ToolWrapperOptions {
  /** Timeout en ms par appel d'outil (défaut: 5000). */
  timeoutMs?: number;
  /** Nombre max d'appels par outil dans une conversation (désactivé si absent). */
  maxCalls?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Enveloppe chaque outil avec :
 * 1. Logging structuré (nom, input, durée, succès/échec)
 * 2. Timeout configurable
 * 3. Rate-limit par nom d'outil
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

      // Rate limit
      if (maxCalls !== undefined) {
        const count = (callCounts.get(name) ?? 0) + 1;
        callCounts.set(name, count);
        if (count > maxCalls) {
          const msg = `Limite atteinte : l'outil ${name} ne peut être appelé que ${maxCalls} fois.`;
          console.warn(`[Tool] ${name} RATE_LIMITED (appel #${count})`);
          return JSON.stringify({ found: false, code: "RATE_LIMITED", message: msg });
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
        throw err;
      }
    };

    return t;
  });
}
