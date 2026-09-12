<script setup lang="ts">
import { computed } from "vue";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { parseMessageSegments } from "./parseMessageContent.js";
import MermaidBlock from "./MermaidBlock.vue";
import ChartBlock from "./ChartBlock.vue";

const props = defineProps<{ content: string }>();

const md = new MarkdownIt({ html: true, breaks: true, linkify: true });

const segments = computed(() => parseMessageSegments(props.content));

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSourceIcon(type?: string): string {
  switch (type?.toLowerCase()) {
    case "sql":
    case "database":
      return "mdi-database";
    case "api":
      return "mdi-api";
    case "web":
      return "mdi-web";
    case "file":
      return "mdi-file-document-outline";
    case "doc":
    default:
      return "mdi-book-open-page-variant-outline";
  }
}

function renderSourceChip(jsonStr: string): string {
  try {
    const parsed = JSON.parse(jsonStr);
    const title = escapeHtml(parsed.title || "Source");
    const rawUrl = parsed.url ? String(parsed.url).trim() : undefined;
    const isSafeUrl =
      rawUrl &&
      (rawUrl.startsWith("http://") ||
        rawUrl.startsWith("https://") ||
        rawUrl.startsWith("/"));
    const url = isSafeUrl ? escapeHtml(rawUrl) : undefined;
    const type = escapeHtml(parsed.type || "doc");
    const icon = getSourceIcon(parsed.type);

    if (url) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="source-chip source-chip--link source-chip--${type}" title="${title} (${url})"><i class="mdi ${icon} source-chip__icon" aria-hidden="true"></i><span class="source-chip__label">${title}</span><i class="mdi mdi-open-in-new source-chip__external" aria-hidden="true"></i></a>`;
    }

    return `<span class="source-chip source-chip--static source-chip--${type}" title="${title}"><i class="mdi ${icon} source-chip__icon" aria-hidden="true"></i><span class="source-chip__label">${title}</span></span>`;
  } catch {
    return "";
  }
}

function renderMarkdown(text: string): string {
  let processed = text;
  // Transformation des marqueurs complets [[source:{...}]] en chip visuelle
  processed = processed.replace(/\[\[source:(\{[\s\S]*?\})\]\]/g, (_, jsonStr) => {
    return renderSourceChip(jsonStr);
  });
  // Pendant le streaming, masquer un marqueur incomplet en fin de message pour éviter le scintillement de JSON brut
  processed = processed.replace(/\[\[source:(\{[\s\S]*?)?$/, "");

  return DOMPurify.sanitize(md.render(processed), {
    ADD_TAGS: ["i", "span", "a"],
    ADD_ATTR: ["target", "rel", "class", "href", "title", "aria-hidden"],
  });
}
</script>

<template>
  <div class="message-content">
    <template v-for="(segment, index) in segments" :key="index">
      <div
        v-if="segment.type === 'markdown'"
        class="message-content__markdown"
        v-html="renderMarkdown(segment.text)"
      />
      <MermaidBlock v-else-if="segment.type === 'mermaid'" :code="segment.code" />
      <ChartBlock v-else :json="segment.json" />
    </template>
  </div>
</template>

<style scoped>
.message-content__markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.5rem 0;
  max-width: 100%;
  overflow-x: auto;
  display: block;
}

.message-content__markdown :deep(th),
.message-content__markdown :deep(td) {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.22);
  padding: 0.35rem 0.6rem;
  text-align: left;
}

.message-content__markdown :deep(p) {
  margin: 0 0 0.5rem;
}

.message-content__markdown :deep(p:last-child) {
  margin-bottom: 0;
}

/* Chip visuelle pour les sources inspirée de v-chip Vuetify */
.message-content__markdown :deep(.source-chip) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0 4px;
  padding: 2px 9px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.3;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  color: rgb(var(--v-theme-on-surface)) !important;
  text-decoration: none;
  vertical-align: baseline;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease-in-out;
  cursor: default;
}

.message-content__markdown :deep(.source-chip--link) {
  cursor: pointer;
}

.message-content__markdown :deep(.source-chip--link:hover) {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  filter: brightness(0.96);
  text-decoration: none;
}

.message-content__markdown :deep(.source-chip__icon) {
  font-size: 14px;
  display: inline-flex;
  align-items: center;
}

.message-content__markdown :deep(.source-chip__label) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.message-content__markdown :deep(.source-chip__external) {
  font-size: 11px;
  opacity: 0.7;
  display: inline-flex;
  align-items: center;
}

/* Variantes thématiques selon le type — teintes dérivées des couleurs
   sémantiques du thème Vuetify actif, donc lisibles en clair comme en sombre. */
.message-content__markdown :deep(.source-chip--doc) {
  background-color: rgba(var(--v-theme-info), 0.14);
  border-color: rgba(var(--v-theme-info), 0.45);
  color: rgb(var(--v-theme-info)) !important;
}

.message-content__markdown :deep(.source-chip--sql),
.message-content__markdown :deep(.source-chip--database) {
  background-color: rgba(var(--v-theme-warning), 0.16);
  border-color: rgba(var(--v-theme-warning), 0.45);
  color: rgb(var(--v-theme-warning)) !important;
}

.message-content__markdown :deep(.source-chip--api) {
  background-color: rgba(var(--v-theme-success), 0.14);
  border-color: rgba(var(--v-theme-success), 0.45);
  color: rgb(var(--v-theme-success)) !important;
}

.message-content__markdown :deep(.source-chip--web) {
  background-color: rgba(var(--v-theme-secondary), 0.18);
  border-color: rgba(var(--v-theme-secondary), 0.5);
  color: rgb(var(--v-theme-secondary)) !important;
}

.message-content__markdown :deep(.source-chip--file) {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  border-color: rgba(var(--v-theme-on-surface), 0.25);
  color: rgb(var(--v-theme-on-surface)) !important;
}
</style>
