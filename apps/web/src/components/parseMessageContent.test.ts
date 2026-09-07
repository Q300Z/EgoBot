import { describe, it, expect } from "vitest";
import { parseMessageSegments } from "./parseMessageContent.js";

describe("parseMessageSegments", () => {
  it("retourne un seul segment markdown pour un texte sans bloc riche", () => {
    const segments = parseMessageSegments("Bonjour, voici votre statut.");
    expect(segments).toEqual([{ type: "markdown", text: "Bonjour, voici votre statut." }]);
  });

  it("découpe un message mixte texte / mermaid / chart dans l'ordre d'apparition", () => {
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

    const segments = parseMessageSegments(content);

    expect(segments.map((s) => s.type)).toEqual(["markdown", "mermaid", "markdown", "chart", "markdown"]);
    expect(segments[1]).toEqual({ type: "mermaid", code: "stateDiagram-v2" });
    expect(segments[3]).toEqual({
      type: "chart",
      json: '{"type":"bar","labels":["a"],"datasets":[{"label":"x","data":[1]}]}',
    });
  });

  it("retourne un tableau vide pour un contenu vide", () => {
    expect(parseMessageSegments("")).toEqual([]);
  });
});
