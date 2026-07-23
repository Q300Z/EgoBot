<template>
  <v-row class="fill-height ma-0" no-gutters>
    <!-- Sidebar Historique Conversations -->
    <v-col cols="12" md="3" lg="2" class="pr-md-2 mb-4 mb-md-0">
      <v-card height="100%" class="d-flex flex-column rounded-lg border">
        <v-card-title class="d-flex align-center justify-space-between pa-3">
          <span class="text-subtitle-1 font-weight-bold">Conversations</span>
          <v-btn
            icon="mdi-plus"
            color="primary"
            size="small"
            variant="flat"
            title="Nouvelle Conversation"
            aria-label="Nouvelle Conversation"
            @click="handleNewConversation"
          ></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-list density="compact" nav class="flex-grow-1 overflow-y-auto pa-2">
          <v-list-item
            v-for="c in chatStore.conversations"
            :key="c.id"
            :active="chatStore.currentConversation?.id === c.id"
            color="primary"
            rounded="lg"
            class="mb-1"
            @click="selectConversation(c.id)"
          >
            <template #prepend>
              <v-icon icon="mdi-message-text-outline" size="small"></v-icon>
            </template>
            <v-list-item-title class="text-caption font-weight-medium">
              {{ c.title || 'Sans titre' }}
            </v-list-item-title>
            <template #append>
              <v-btn
                icon="mdi-delete-outline"
                size="x-small"
                variant="text"
                color="error"
                title="Supprimer la conversation"
                aria-label="Supprimer la conversation"
                @click.stop="handleDeleteConversation(c.id)"
              ></v-btn>
            </template>
          </v-list-item>
          <div v-if="chatStore.conversations.length === 0" class="text-center text-caption text-disabled pa-4">
            Aucune conversation
          </div>
        </v-list>
      </v-card>
    </v-col>

    <!-- Zone de Chat Principale -->
    <v-col cols="12" md="9" lg="10" class="pl-md-2">
      <v-card height="100%" class="d-flex flex-column rounded-lg border">
        <!-- En-tête Chat -->
        <v-card-title class="d-flex align-center justify-space-between border-b pa-3">
          <div class="d-flex align-center">
            <v-icon icon="mdi-chat-processing" color="primary" class="mr-2"></v-icon>
            <span class="text-h6 font-weight-bold">
              {{ chatStore.currentConversation?.title || 'Nouvelle Discussion' }}
            </span>
          </div>
          <v-chip v-if="chatStore.isStreaming" color="warning" size="small" prepend-icon="mdi-loading mdi-spin">
            Génération en cours...
          </v-chip>
        </v-card-title>

        <!-- Flux de Messages Accessibilité WCAG AA -->
        <v-card-text
          ref="chatBoxRef"
          class="flex-grow-1 overflow-y-auto pa-4"
          role="log"
          aria-live="polite"
          aria-label="Historique des messages de la conversation avec EgoBot"
        >
          <div v-if="!chatStore.currentConversation?.messages?.length" class="d-flex flex-column align-center justify-center fill-height text-disabled">
            <v-icon icon="mdi-truck-fast-outline" size="64" class="mb-2" color="secondary" aria-hidden="true"></v-icon>
            <div class="text-h6 font-weight-bold">EgoBot — Assistant virtuel EgoNet</div>
            <div class="text-caption">Duhamel Logistique — Posez vos questions sur vos réceptions, expéditions et stocks</div>
          </div>

          <ChatMessage
            v-for="(msg, idx) in chatStore.currentConversation?.messages || []"
            :key="idx"
            :message="msg"
          />
        </v-card-text>

        <!-- Zone de Saisie Accessibilité ARIA -->
        <v-divider></v-divider>
        <v-card-actions class="pa-3">
          <v-text-field
            v-model="promptInput"
            placeholder="Posez votre question sur vos stocks, livraisons..."
            label="Votre message pour EgoBot"
            aria-label="Saisir votre message pour l'assistant EgoBot"
            variant="outlined"
            density="comfortable"
            hide-details
            :disabled="chatStore.isStreaming"
            @keyup.enter="handleSend"
          >
            <template #append-inner>
              <v-btn
                icon="mdi-send"
                color="secondary"
                variant="flat"
                size="small"
                aria-label="Envoyer le message"
                title="Envoyer le message"
                :loading="chatStore.isStreaming"
                :disabled="!promptInput.trim()"
                @click="handleSend"
              ></v-btn>
            </template>
          </v-text-field>
        </v-card-actions>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import ChatMessage from "../components/ChatMessage.vue";

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const authStore = useAuthStore();

const promptInput = ref("");
const chatBoxRef = ref<any>(null);

async function selectConversation(id: string) {
  if (router && route.path !== `/chat/${id}`) {
    router.push(`/chat/${id}`);
  }
  await chatStore.loadConversation(id);
  await scrollToBottom();
}

function handleNewConversation() {
  chatStore.currentConversation = null;
  if (router && route.path !== "/chat") {
    router.push("/chat");
  }
}

async function handleSend() {
  if (!promptInput.value.trim() || chatStore.isStreaming) return;
  const text = promptInput.value;
  promptInput.value = "";
  await chatStore.sendMessage(text);
  await scrollToBottom();
}

async function handleDeleteConversation(id: string) {
  await authStore.sdk.deleteConversation(id);
  await chatStore.loadConversations();
  if (chatStore.currentConversation?.id === id) {
    chatStore.currentConversation = null;
  }
}

async function scrollToBottom() {
  await nextTick();
  if (chatBoxRef.value?.$el) {
    chatBoxRef.value.$el.scrollTop = chatBoxRef.value.$el.scrollHeight;
  }
}

watch(
  () => route?.params?.id,
  async (newId) => {
    if (newId && typeof newId === "string" && chatStore.currentConversation?.id !== newId) {
      await chatStore.loadConversation(newId);
      await scrollToBottom();
    }
  },
  { immediate: true }
);

onMounted(async () => {
  if (chatStore.conversations.length === 0) {
    await chatStore.loadConversations();
  }
});
</script>
