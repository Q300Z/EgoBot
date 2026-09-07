<template>
  <v-dialog :model-value="modelValue" max-width="850" persistent @update:model-value="emit('update:modelValue', $event)">
    <v-card class="d-flex flex-column rounded-lg">
      <v-card-title class="d-flex align-center justify-space-between border-b pa-3">
        <div class="d-flex align-center">
          <v-icon icon="mdi-chat-processing-outline" color="primary" class="mr-2"></v-icon>
          <div>
            <div class="text-h6 font-weight-bold">
              {{ conversation?.title || 'Inspection Conversation' }}
            </div>
            <div class="text-caption text-disabled" v-if="conversation?.user">
              Utilisateur : {{ conversation.user.email }} ({{ conversation.id }})
            </div>
          </div>
        </div>
        <div class="d-flex align-center">
          <v-chip v-if="isStreaming" color="warning" size="small" class="mr-2" prepend-icon="mdi-radiobox-marked mdi-spin">
            Réponse en direct (SSE Stream)...
          </v-chip>
          <v-chip v-else color="success" size="small" class="mr-2" prepend-icon="mdi-check-circle-outline">
            Écoute SSE Active
          </v-chip>
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fermer la fenêtre" title="Fermer" @click="close"></v-btn>
        </div>
      </v-card-title>

      <v-card-text ref="chatBoxRef" class="flex-grow-1 overflow-y-auto pa-4" style="max-height: 60vh;">
        <div v-if="!conversation?.messages?.length" class="text-center text-disabled pa-8">
          Aucun message dans cette conversation.
        </div>

        <ChatMessage
          v-for="(msg, idx) in conversation?.messages || []"
          :key="idx"
          :message="msg"
          :user-name="conversation?.user?.email"
        />
      </v-card-text>

      <v-divider></v-divider>
      <v-card-actions class="pa-3 justify-end">
        <v-btn color="primary" variant="flat" class="text-none" @click="close">Fermer</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import ChatMessage from "./ChatMessage.vue";

const props = defineProps<{
  modelValue: boolean;
  conversation: any;
  isStreaming?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "close"): void;
}>();

const chatBoxRef = ref<any>(null);

watch(
  () => props.conversation?.messages?.length,
  async () => {
    await nextTick();
    if (chatBoxRef.value?.$el) {
      chatBoxRef.value.$el.scrollTop = chatBoxRef.value.$el.scrollHeight;
    }
  }
);

function close() {
  emit("close");
  emit("update:modelValue", false);
}
</script>
