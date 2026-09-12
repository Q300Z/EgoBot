<template>
  <div
    v-if="!isCancelled"
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
        <div :class="['text-caption mb-1 font-weight-bold', message.role === 'USER' ? 'text-grey-lighten-3' : 'text-medium-emphasis']">
          {{ message.role === 'USER' ? (userName || 'Vous') : 'EgoBot (Duhamel Logistique)' }}
        </div>
        <div v-if="message.role === 'USER'" class="text-body-2 white-space-pre-wrap text-white">{{ message.content }}</div>
        <MessageContent
          v-else-if="message.content"
          :content="message.content"
          class="markdown-body"
        />
        <div v-else class="text-body-2 markdown-body">...</div>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import MessageContent from "./MessageContent.vue";

const props = defineProps<{
  message: {
    role: "USER" | "ASSISTANT";
    content: string;
    cancelled?: boolean;
    status?: string;
  };
  userName?: string;
}>();

const isCancelled = computed(() => {
  const msg = props.message as any;
  if (!msg) return false;
  // Ne s'applique qu'au chatbot / assistant
  if (msg.role !== "ASSISTANT") return false;
  // 1. Marque booléenne explicite
  if (msg.cancelled === true) return true;
  // 2. Marque de statut
  if (msg.status === "CANCELLED") return true;
  // 3. Marque textuelle de repli pour distinguer un message annulé d'un message en cours de génération
  if (typeof msg.content === "string") {
    const trimmed = msg.content.trim();
    if (trimmed === "<cancelled>" || trimmed === "[cancelled]" || trimmed.startsWith("<cancelled>")) {
      return true;
    }
  }
  return false;
});
</script>

<style scoped>
.white-space-pre-wrap {
  white-space: pre-wrap;
}
.max-w-75 {
  max-width: 75%;
}
/* Couleurs pilotées par le thème Vuetify actif (clair ou sombre) via ses
   variables CSS : plus aucune teinte figée qui rendrait le texte illisible
   sur la bulle sombre en dark mode. */
.markdown-body {
  color: rgb(var(--v-theme-on-surface)) !important;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0.5rem 0;
  width: 100%;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  padding: 6px 12px;
  text-align: left;
  color: rgb(var(--v-theme-on-surface)) !important;
}
.markdown-body :deep(th) {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  font-weight: bold;
}
.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 0.5rem 0;
}
.markdown-body :deep(pre) {
  background-color: #0e151c;
  color: #e6ecf1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
  overflow-x: auto;
}
.markdown-body :deep(code) {
  font-family: monospace;
  font-size: 0.9em;
}
.markdown-body :deep(:not(pre) > code) {
  background-color: rgba(var(--v-theme-on-surface), 0.1);
  padding: 1px 5px;
  border-radius: 4px;
}
.markdown-body :deep(a) {
  color: rgb(var(--v-theme-primary));
}
.markdown-body :deep(p) {
  margin-bottom: 0.5rem;
  color: rgb(var(--v-theme-on-surface)) !important;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
