<script setup lang="ts">
import { computed } from "vue";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { parseMessageSegments } from "./parseMessageContent.js";
import MermaidBlock from "./MermaidBlock.vue";
import ChartBlock from "./ChartBlock.vue";

const props = defineProps<{ content: string }>();

const md = new MarkdownIt({ breaks: true, linkify: true });

const segments = computed(() => parseMessageSegments(props.content));

function renderMarkdown(text: string): string {
  // Le texte peut être influencé par le LLM ou par un outil : sanitisation
  // obligatoire avant toute injection via v-html, pour ne jamais introduire
  // de XSS.
  return DOMPurify.sanitize(md.render(text));
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
  border: 1px solid rgba(128, 128, 128, 0.3);
  padding: 0.35rem 0.6rem;
  text-align: left;
}

.message-content__markdown :deep(p) {
  margin: 0 0 0.5rem;
}

.message-content__markdown :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
