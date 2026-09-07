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
        <MessageContent
          v-else-if="message.content"
          :content="message.content"
          class="markdown-body text-grey-darken-4"
        />
        <div v-else class="text-body-2 markdown-body text-grey-darken-4">...</div>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import MessageContent from "./MessageContent.vue";

defineProps<{
  message: { role: "USER" | "ASSISTANT"; content: string };
  userName?: string;
}>();
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
</style>
