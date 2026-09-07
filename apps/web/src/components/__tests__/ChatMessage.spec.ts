import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChatMessage from "../ChatMessage.vue";

describe("ChatMessage.vue", () => {
  it("should render user message cleanly", () => {
    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: "USER", content: "Comment suivre une expédition ?" },
        userName: "Alice",
      },
    });

    expect(wrapper.text()).toContain("Comment suivre une expédition ?");
    expect(wrapper.text()).toContain("Alice");
  });

  it("should render assistant message markdown and transform source marker into clickable chip", () => {
    const sourceObj = {
      title: "Manuel Logistique v2",
      url: "https://example.com/doc",
      type: "doc",
    };
    const content = `Voici la référence : [[source:${JSON.stringify(sourceObj)}]] pour plus de détails.`;

    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: "ASSISTANT", content },
      },
    });

    const chipLink = wrapper.find("a.source-chip");
    expect(chipLink.exists()).toBe(true);
    expect(chipLink.attributes("href")).toBe("https://example.com/doc");
    expect(chipLink.attributes("target")).toBe("_blank");
    expect(chipLink.attributes("rel")).toBe("noopener noreferrer");
    expect(chipLink.text()).toContain("Manuel Logistique v2");
    expect(chipLink.classes()).toContain("source-chip--doc");
    expect(chipLink.find("i.mdi-book-open-page-variant-outline").exists()).toBe(true);
    expect(chipLink.find("i.mdi-open-in-new").exists()).toBe(true);

    // Surrounding text is rendered
    expect(wrapper.text()).toContain("Voici la référence :");
    expect(wrapper.text()).toContain("pour plus de détails.");
  });

  it("should render static non-clickable chip when url is absent", () => {
    const sourceObj = {
      title: "Base SQL Entrepôts",
      type: "sql",
    };
    const content = `Données issues de [[source:${JSON.stringify(sourceObj)}]].`;

    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: "ASSISTANT", content },
      },
    });

    expect(wrapper.find("a.source-chip").exists()).toBe(false);
    const chipSpan = wrapper.find("span.source-chip");
    expect(chipSpan.exists()).toBe(true);
    expect(chipSpan.classes()).toContain("source-chip--static");
    expect(chipSpan.classes()).toContain("source-chip--sql");
    expect(chipSpan.text()).toContain("Base SQL Entrepôts");
    expect(chipSpan.find("i.mdi-database").exists()).toBe(true);
  });

  it("should support different source types (api, web, file, database)", () => {
    const types = [
      { type: "api", icon: "mdi-api" },
      { type: "web", icon: "mdi-web" },
      { type: "file", icon: "mdi-file-document-outline" },
      { type: "database", icon: "mdi-database" },
    ];

    for (const item of types) {
      const content = `Source: [[source:${JSON.stringify({ title: `Src ${item.type}`, type: item.type })}]]`;
      const wrapper = mount(ChatMessage, {
        props: {
          message: { role: "ASSISTANT", content },
        },
      });

      const chip = wrapper.find(`.source-chip--${item.type}`);
      expect(chip.exists()).toBe(true);
      expect(chip.find(`i.${item.icon}`).exists()).toBe(true);
    }
  });

  it("should hide incomplete trailing source marker during streaming", () => {
    const content = 'Bonjour ! Voici la documentation [[source:{"title":"Manuel';

    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: "ASSISTANT", content },
      },
    });

    // The incomplete JSON is masked during live streaming
    expect(wrapper.text()).not.toContain("[[source:");
    expect(wrapper.text()).not.toContain('{"title":"Manuel');
    expect(wrapper.text()).toContain("Bonjour ! Voici la documentation");
  });

  it("should render correctly when reloaded from database with existing full content", () => {
    const persistedContent =
      'Bonjour ! Je suis un worker d\'inférence basé sur la documentation officielle [[source:{"type":"doc","title":"Manuel Logistique v2","url":"https://example.com/doc"}]] pour répondre précisément à votre demande.';

    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: "ASSISTANT", content: persistedContent },
      },
    });

    expect(wrapper.find("a.source-chip").exists()).toBe(true);
    expect(wrapper.find("a.source-chip").text()).toContain("Manuel Logistique v2");
    expect(wrapper.text()).toContain("Bonjour ! Je suis un worker d'inférence");
    expect(wrapper.text()).toContain("pour répondre précisément à votre demande.");
  });
});
