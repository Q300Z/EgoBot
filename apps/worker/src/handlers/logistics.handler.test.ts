import { describe, it } from "node:test";
import assert from "node:assert";
import { createLogisticsHandler } from "./logistics.handler.js";

function createMockContext() {
  const tokens: string[] = [];
  return {
    ctx: {
      jobId: "job-1",
      conversationId: "conv-1",
      sendToken: async (chunk: string) => {
        tokens.push(chunk);
      },
      sendSource: async (source: any) => {
        tokens.push(`[[source:${JSON.stringify(source)}]]`);
      },
      deferJob: async () => {},
      checkCancellation: async () => false,
    },
    tokens,
  };
}

async function* asyncOf<T>(...items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

function fakeAgentStream(textChunks: string[], toolCalls: Array<{ name: string; output: unknown }>) {
  return {
    streamEvents: async () => ({
      messages: asyncOf({ text: asyncOf(...textChunks) }),
      toolCalls: asyncOf(...toolCalls.map((call) => ({ name: call.name, output: Promise.resolve(call.output) }))),
    }),
  };
}

describe("createLogisticsHandler", () => {
  it("devrait envoyer un message clair si l'email client est manquant, sans requête Prisma", async () => {
    let findUniqueCalled = false;
    const prisma: any = {
      customer: {
        findUnique: async () => {
          findUniqueCalled = true;
          return null;
        },
      },
    };

    const handler = createLogisticsHandler({ getPrisma: () => prisma });
    const { ctx, tokens } = createMockContext();

    await handler({ prompt: "Où est ma commande ?" }, ctx as any);

    assert.strictEqual(findUniqueCalled, false);
    assert.strictEqual(tokens.length, 1);
    assert.match(tokens[0]!, /identifier/i);
  });

  it("devrait envoyer un message clair si aucun customer ne correspond à l'email", async () => {
    const prisma: any = {
      customer: {
        findUnique: async () => null,
      },
    };

    const handler = createLogisticsHandler({ getPrisma: () => prisma });
    const { ctx, tokens } = createMockContext();

    await handler({ prompt: "Où est ma commande ?", customer: { email: "inconnu@test.com" } }, ctx as any);

    assert.strictEqual(tokens.length, 1);
    assert.match(tokens[0]!, /aucun compte client/i);
  });

  it("devrait streamer le texte et injecter un bloc chart déterministe depuis le tool call", async () => {
    const prisma: any = {
      customer: {
        findUnique: async ({ where }: any) => {
          assert.strictEqual(where.email, "client@test.com");
          return { id: "11111111-1111-4111-8111-111111111111", email: "client@test.com", isActive: true };
        },
      },
    };

    let receivedAgentOptions: any = null;
    const createAgent = (options: any) => {
      receivedAgentOptions = options;
      return fakeAgentStream(["Le produit ", "est disponible."], [
        {
          name: "get_product_availability",
          output: {
            found: true,
            product: {
              sku: "SKU-001",
              name: "Carton",
              isAvailable: true,
              onHandQuantity: 120,
              reservedQuantity: 30,
              availableQuantity: 90,
            },
          },
        },
      ]);
    };

    const handler = createLogisticsHandler({ getPrisma: () => prisma, createAgent: createAgent as any });
    const { ctx, tokens } = createMockContext();

    await handler(
      { prompt: "Disponibilité de SKU-001 ?", customer: { email: "client@test.com" } },
      ctx as any,
    );

    assert.deepStrictEqual(receivedAgentOptions.customer, {
      customerId: "11111111-1111-4111-8111-111111111111",
      email: "client@test.com",
    });

    const fullContent = tokens.join("");
    assert.match(fullContent, /Le produit est disponible\./);
    assert.match(fullContent, /```chart/);
    assert.match(fullContent, /"data":\[120,30,90,0\]/);
    assert.match(fullContent, /\[\[source:\{"title":"Disponibilité des Articles","type":"doc"\}\]\]/);
  });

  it("devrait lire l'email et le prompt depuis payload.data (enveloppe réelle d'apps/api)", async () => {
    const prisma: any = {
      customer: {
        findUnique: async ({ where }: any) => {
          assert.strictEqual(where.email, "client@test.com");
          return { id: "11111111-1111-4111-8111-111111111111", email: "client@test.com", isActive: true };
        },
      },
    };

    let receivedPrompt: string | null = null;
    const createAgent = () => ({
      streamEvents: async (state: any) => {
        receivedPrompt = state.messages[0].content;
        return {
          messages: asyncOf({ text: asyncOf("OK") }),
          toolCalls: asyncOf(),
        };
      },
    });

    const handler = createLogisticsHandler({ getPrisma: () => prisma, createAgent: createAgent as any });
    const { ctx, tokens } = createMockContext();

    // Forme produite par JobStreamHandler.publishToInferenceQueue : prompt et
    // email imbriqués sous `data`, pas de champ `customer` du tout.
    await handler(
      {
        kind: "state",
        job_id: "job-1",
        conversation_id: "conv-1",
        data: { email: "client@test.com", prompt: "Où est ma commande ?" },
      },
      ctx as any,
    );

    assert.strictEqual(receivedPrompt, "Où est ma commande ?");
    assert.strictEqual(tokens.join(""), "OK");
  });

  it("devrait arrêter le streaming de texte si l'annulation est détectée", async () => {
    const prisma: any = {
      customer: {
        findUnique: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          email: "client@test.com",
          isActive: true,
        }),
      },
    };
    const createAgent = () => fakeAgentStream(["A", "B", "C"], []);

    const handler = createLogisticsHandler({ getPrisma: () => prisma, createAgent: createAgent as any });
    const { ctx, tokens } = createMockContext();
    let checkCount = 0;
    (ctx as any).checkCancellation = async () => {
      checkCount++;
      return checkCount > 1;
    };

    await handler({ prompt: "test", customer: { email: "client@test.com" } }, ctx as any);

    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0], "A");
  });
});
