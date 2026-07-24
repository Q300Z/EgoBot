import { describe, it } from "node:test";
import assert from "node:assert";
import { EventBus } from "../../../events/eventBus.js";

describe("EventBus Unit Tests", () => {
  it("devrait publier et recevoir des événements ciblés", () => {
    const bus = new EventBus();
    const received: any[] = [];

    const unsubscribe = bus.subscribe("orders.created", (envelope) => {
      received.push(envelope);
    });

    const corrId = bus.publish("orders.created", { orderId: 42 });

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].correlationId, corrId);
    assert.strictEqual(received[0].payload.orderId, 42);

    unsubscribe();
    bus.publish("orders.created", { orderId: 43 });
    assert.strictEqual(received.length, 1);
  });

  it("subscribeAll devrait écouter tous les sujets publiés", () => {
    const bus = new EventBus();
    const allReceived: { topic: string; payload: any }[] = [];

    const unsubscribe = bus.subscribeAll((topic, envelope) => {
      allReceived.push({ topic, payload: envelope.payload });
    });

    bus.publish("topic.a", { text: "A" });
    bus.publish("topic.b", { text: "B" });

    assert.strictEqual(allReceived.length, 2);
    assert.strictEqual(allReceived[0].topic, "topic.a");
    assert.strictEqual(allReceived[1].topic, "topic.b");

    unsubscribe();
  });

  it("request devrait résoudre la réponse lorsque le sujet de réponse est émis", async () => {
    const bus = new EventBus();

    // Écouter la commande et envoyer la réponse
    bus.subscribe("math.square", (envelope) => {
      const num = (envelope.payload as any).value;
      bus.publish("math.square.reply", { result: num * num }, envelope.correlationId);
    });

    const reply = await bus.request<{ result: number }>("math.square", "math.square.reply", { value: 5 }, 2000);
    assert.strictEqual(reply.result, 25);
  });

  it("request devrait rejeter avec une erreur si le payload de réponse contient une erreur", async () => {
    const bus = new EventBus();

    bus.subscribe("test.fail", (envelope) => {
      bus.publish("test.fail.reply", { error: "Opération échouée" }, envelope.correlationId);
    });

    await assert.rejects(
      async () => {
        await bus.request("test.fail", "test.fail.reply", {}, 2000);
      },
      { message: "Opération échouée" }
    );
  });

  it("request devrait déclencher un timeout si aucune réponse n'est reçue", async () => {
    const bus = new EventBus();

    await assert.rejects(
      async () => {
        await bus.request("no.reply.topic", "no.reply.topic.reply", {}, 100);
      },
      (err: any) => {
        assert.ok(err.message.includes("Timeout EventBus"));
        return true;
      }
    );
  });
});
