export type MessageSegment =
  | { type: "markdown"; text: string }
  | { type: "mermaid"; code: string }
  | { type: "chart"; json: string };

const FENCE_RE = /```(mermaid|chart)\n([\s\S]*?)\n```/g;

/**
 * Découpe un message assistant en segments markdown / mermaid / chart, sur la
 * base des blocs de code fenced. Les blocs mermaid/chart sont rendus par des
 * composants dédiés ; le reste (y compris les tableaux GFM) reste du markdown
 * normal.
 */
export function parseMessageSegments(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(content))) {
    const [fullMatch, kind, body] = match;

    if (match.index > lastIndex) {
      segments.push({ type: "markdown", text: content.slice(lastIndex, match.index) });
    }

    if (kind === "mermaid") {
      segments.push({ type: "mermaid", code: body ?? "" });
    } else {
      segments.push({ type: "chart", json: body ?? "" });
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "markdown", text: content.slice(lastIndex) });
  }

  return segments;
}
