import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import vuetify from "../plugins/vuetify.js";
import MessageContent from "./MessageContent.vue";

function createWrapper(content: string, stubChart = true) {
  return mount(MessageContent, {
    props: { content },
    global: {
      plugins: [vuetify],
      stubs: stubChart ? { MermaidBlock: true, ChartBlock: true } : { MermaidBlock: true },
    },
  });
}

describe("MessageContent", () => {
  it("découpe un message mixte et délègue les blocs mermaid/chart aux bons composants", () => {
    const content = [
      "Voici le statut :",
      "",
      "```mermaid",
      "stateDiagram-v2",
      "```",
      "",
      "```chart",
      '{"type":"bar","labels":["a"],"datasets":[{"label":"x","data":[1]}]}',
      "```",
      "",
      "Fin du message.",
    ].join("\n");

    const wrapper = createWrapper(content);

    expect(wrapper.text()).toContain("Voici le statut");
    expect(wrapper.text()).toContain("Fin du message");
    expect(wrapper.findComponent({ name: "MermaidBlock" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "ChartBlock" }).exists()).toBe(true);
  });

  it("neutralise un <script> injecté dans le texte markdown (XSS)", () => {
    const wrapper = createWrapper("Bonjour <script>window.__pwned = true;</script> !");

    expect(wrapper.find("script").exists()).toBe(false);
    expect((window as any).__pwned).toBeUndefined();
  });

  it("retombe sur le texte brut quand le JSON d'un bloc chart est invalide", () => {
    const content = ["```chart", "ceci n'est pas du JSON valide", "```"].join("\n");

    // ChartBlock n'est pas stubbé ici : un JSON invalide garde `parsed` à null,
    // donc seul le fallback <pre> est rendu, sans jamais atteindre le rendu
    // Chart.js réel (qui nécessite un canvas non disponible en jsdom).
    const wrapper = createWrapper(content, false);

    const fallback = wrapper.find("pre.chart-block-fallback");
    expect(fallback.exists()).toBe(true);
    expect(fallback.text()).toContain("ceci n'est pas du JSON valide");
  });
});
