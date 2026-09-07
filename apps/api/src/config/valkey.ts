import Redis from "ioredis";
import { env } from "./env.js";

// Client Valkey 100% compatible RESP protocol
export const valkeyStream = new Redis(env.VALKEY_URL);
export const valkeyReader = new Redis(env.VALKEY_URL);
export const valkeyWriter = new Redis(env.VALKEY_URL);

/**
 * Énumère les clés correspondant à un motif, via SCAN plutôt que KEYS.
 *
 * KEYS parcourt l'intégralité de l'espace de clés en une seule opération et
 * bloque le thread unique du serveur pendant tout ce temps : sur une base
 * chargée, il fige toutes les autres commandes. SCAN parcourt le même espace
 * par lots, en rendant la main entre chaque itération.
 *
 * La distinction compte ici parce que ces énumérations tournent en boucle —
 * JobService interroge le motif toutes les 200 ms, soit cinq fois par seconde.
 *
 * Contrepartie assumée : SCAN ne garantit pas un instantané cohérent. Une clé
 * créée pendant le parcours peut être manquée, et une clé peut être renvoyée
 * deux fois. Pour les deux usages concernés — repérer les flux SSE actifs et
 * compter les workers présents — c'est sans conséquence : la boucle repasse
 * 200 ms plus tard, et les doublons sont dédupliqués ci-dessous.
 */
export async function scanKeys(client: Redis, pattern: string, batchSize = 100): Promise<string[]> {
  const found = new Set<string>();
  let cursor = "0";

  do {
    const [nextCursor, batch] = await client.scan(cursor, "MATCH", pattern, "COUNT", batchSize);
    cursor = nextCursor;
    for (const key of batch) {
      found.add(key);
    }
  } while (cursor !== "0");

  return [...found];
}
