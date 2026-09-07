<template>
  <div
    :class="['d-flex mb-4', message.role === 'USER' ? 'justify-end' : 'justify-start']"
    :aria-label="message.role === 'USER' ? 'Votre message' : 'Message de l\'assistant EgoBot'"
  >
    <div :class="['d-flex align-start max-w-75', message.role === 'USER' ? 'flex-row-reverse' : 'flex-row']">
      <v-avatar size="32" :color="message.role === 'USER' ? 'primary' : 'secondary'" class="mx-2" aria-hidden="true">
        <v-icon :icon="message.role === 'USER' ? 'mdi-account' : 'mdi-robot-outline'" size="18" color="white"></v-icon>
      </v-avatar>
      <v-card
        :color="message.role === 'USER' ? 'primary' : 'surface-variant'"
        variant="flat"
        class="pa-3 rounded-lg"
        elevation="1"
      >
        <div :class="['text-caption mb-1 font-weight-bold', message.role === 'USER' ? 'text-grey-lighten-3' : 'text-grey-darken-4']">
          {{ message.role === 'USER' ? (userName || 'Vous') : 'EgoBot (Duhamel Logistique)' }}
        </div>
        <div v-if="message.role === 'USER'" class="text-body-2 white-space-pre-wrap text-white">{{ message.content }}</div>
        <div v-else class="text-body-2 markdown-body text-grey-darken-4" v-html="renderedMarkdown"></div>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";

const props = defineProps<{
  message: { role: "USER" | "ASSISTANT"; content: string };
  userName?: string;
}>();

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

const renderedMarkdown = computed(() => {
  if (!props.message?.content) return "...";

  let raw = props.message.content;

  // Transformation des marqueurs complets [[source:{...}]] en chip visuelle
  raw = raw.replace(/\[\[source:(\{[\s\S]*?\})\]\]/g, (_, jsonStr) => {
    return renderSourceChip(jsonStr);
  });

  // Pendant le streaming, masquer un marqueur incomplet en fin de message pour éviter le scintillement de JSON brut
  raw = raw.replace(/\[\[source:(\{[\s\S]*?)?$/, "");

  try {
    return marked.parse(raw, { gfm: true, breaks: true }) as string;
  } catch {
    return raw;
  }
});
</script>

<style scoped>
.white-space-pre-wrap {
  white-space: pre-wrap;
}
.max-w-75 {
  max-width: 75%;
}
.markdown-body {
  color: #182630 !important;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0.5rem 0;
  width: 100%;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(24, 38, 48, 0.3);
  padding: 6px 12px;
  text-align: left;
  color: #182630 !important;
}
.markdown-body :deep(th) {
  background-color: rgba(24, 38, 48, 0.1);
  font-weight: bold;
}
.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 0.5rem 0;
}
.markdown-body :deep(pre) {
  background-color: #182630;
  color: #FFFFFF;
  padding: 8px 12px;
  border-radius: 6px;
  overflow-x: auto;
}
.markdown-body :deep(code) {
  font-family: monospace;
  font-size: 0.9em;
}
.markdown-body :deep(p) {
  margin-bottom: 0.5rem;
  color: #182630 !important;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

/* Chip visuelle pour les sources inspirée de v-chip Vuetify */
.markdown-body :deep(.source-chip) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0 4px;
  padding: 2px 9px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.3;
  border-radius: 16px;
  border: 1px solid rgba(24, 38, 48, 0.2);
  background-color: #e6ecf0;
  color: #182630 !important;
  text-decoration: none;
  vertical-align: baseline;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease-in-out;
  cursor: default;
}

.markdown-body :deep(.source-chip--link) {
  cursor: pointer;
}

.markdown-body :deep(.source-chip--link:hover) {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  filter: brightness(0.96);
  text-decoration: none;
}

.markdown-body :deep(.source-chip__icon) {
  font-size: 14px;
  display: inline-flex;
  align-items: center;
}

.markdown-body :deep(.source-chip__label) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.markdown-body :deep(.source-chip__external) {
  font-size: 11px;
  opacity: 0.7;
  display: inline-flex;
  align-items: center;
}

/* Variantes thématiques selon le type */
.markdown-body :deep(.source-chip--doc) {
  background-color: #e0f2fe;
  border-color: #7dd3fc;
  color: #0369a1 !important;
}

.markdown-body :deep(.source-chip--sql),
.markdown-body :deep(.source-chip--database) {
  background-color: #fef3c7;
  border-color: #fcd34d;
  color: #92400e !important;
}

.markdown-body :deep(.source-chip--api) {
  background-color: #ecfdf5;
  border-color: #6ee7b7;
  color: #047857 !important;
}

.markdown-body :deep(.source-chip--web) {
  background-color: #f3e8ff;
  border-color: #d8b4fe;
  color: #6d28d9 !important;
}

.markdown-body :deep(.source-chip--file) {
  background-color: #f1f5f9;
  border-color: #cbd5e1;
  color: #334155 !important;
}

</style>
