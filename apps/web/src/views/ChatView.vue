<template>
  <div class="d-flex fill-height w-100 overflow-hidden position-relative">
    <!-- Sidebar Historique Conversations (v-navigation-drawer Responsive pour iFrame EgoNet) -->
    <v-navigation-drawer
      v-model="uiStore.drawer"
      location="left"
      width="280"
      class="border-r bg-surface"
    >
      <div class="d-flex align-center justify-space-between pa-3 border-b">
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
      </div>

      <!-- Squelettes de Chargement Sidebar -->
      <div v-if="chatStore.isLoadingConversations" class="pa-3">
        <v-skeleton-loader
          v-for="n in 5"
          :key="n"
          type="list-item-avatar"
          class="mb-2 rounded-lg"
        ></v-skeleton-loader>
      </div>

      <!-- Liste des conversations -->
      <v-list v-else density="compact" nav class="pa-2 overflow-y-auto">
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
          <v-list-item-title class="text-caption font-weight-medium text-truncate">
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
    </v-navigation-drawer>

    <!-- Zone de Chat Principale -->
    <div class="d-flex flex-column flex-grow-1 h-100 overflow-hidden">
      <!-- En-tête Chat (v-app-bar / toolbar compact) -->
      <div class="d-flex align-center justify-space-between border-b pa-3 bg-surface">
        <div class="d-flex align-center text-truncate">
          <v-btn
            icon="mdi-menu"
            variant="text"
            size="small"
            class="mr-2 d-md-none"
            aria-label="Ouvrir le menu des conversations"
            title="Historique des conversations"
            @click="uiStore.toggleDrawer"
          ></v-btn>
          <v-icon icon="mdi-chat-processing" color="primary" class="mr-2" aria-hidden="true"></v-icon>
          <span class="text-subtitle-1 font-weight-bold text-truncate">
            {{ chatStore.currentConversation?.title || 'Nouvelle Discussion' }}
          </span>
        </div>
        <div v-if="chatStore.isStreaming" class="d-flex align-center ga-2">
          <v-chip color="warning" size="small" prepend-icon="mdi-loading mdi-spin">
            Génération...
          </v-chip>
          <v-btn
            size="small"
            variant="tonal"
            color="error"
            prepend-icon="mdi-stop-circle-outline"
            aria-label="Arrêter la génération"
            title="Arrêter la génération"
            @click="chatStore.cancelCurrentMessage"
          >
            Arrêter
          </v-btn>
        </div>
      </div>

      <!-- Flux de Messages (Animation Fondu & Squelettes de Chargement) -->
      <div
        ref="chatBoxRef"
        class="flex-grow-1 overflow-y-auto pa-4 position-relative"
        role="log"
        aria-live="polite"
        aria-label="Historique des messages de la conversation avec EgoBot"
      >
        <v-fade-transition mode="out-in">
          <!-- Squelettes de chargement pendant le changement de conversation -->
          <div v-if="chatStore.isLoadingConversation" key="loading-skeleton" class="pa-4">
            <div class="d-flex justify-end mb-4">
              <v-skeleton-loader type="paragraph" class="w-50 rounded-lg"></v-skeleton-loader>
            </div>
            <div class="d-flex justify-start mb-4">
              <v-skeleton-loader type="article" class="w-75 rounded-lg"></v-skeleton-loader>
            </div>
            <div class="d-flex justify-end mb-4">
              <v-skeleton-loader type="paragraph" class="w-50 rounded-lg"></v-skeleton-loader>
            </div>
          </div>

          <!-- Message de bienvenue si pas de conversation sélectionnée -->
          <div v-else-if="!chatStore.currentConversation?.messages?.length" key="empty-welcome" class="d-flex flex-column align-center justify-center fill-height text-disabled text-center pa-4">
            <v-icon icon="mdi-truck-fast-outline" size="56" class="mb-2" color="secondary" aria-hidden="true"></v-icon>
            <div class="text-h6 font-weight-bold">EgoBot — Assistant virtuel EgoNet</div>
            <div class="text-caption">Duhamel Logistique — Posez vos questions sur vos réceptions, expéditions et stocks</div>
          </div>

          <!-- Affichage fluide des messages de la conversation -->
          <div v-else key="messages-list">
            <ChatMessage
              v-for="(msg, idx) in visibleMessages"
              :key="msg.id || idx"
              :message="msg"
            />
          </div>
        </v-fade-transition>
      </div>

      <!-- Zone de Saisie avec v-textarea multi-lignes auto-extensible -->
      <div class="border-t pa-3 bg-surface">
        <!-- Toujours visible : le mode s'applique au prochain message, y compris
             dans une conversation déjà commencée. -->
        <v-btn-toggle
          v-model="selectedModel"
          color="primary"
          density="compact"
          mandatory
          class="mb-2"
          aria-label="Mode de réponse du prochain message"
        >
          <v-tooltip location="top" text="Mode démonstration : réponses simulées avec graphiques, tableaux et diagrammes pour tester le rendu visuel.">
            <template #activator="{ props }">
              <v-btn v-bind="props" value="CHATBOT" size="small">Assistant général</v-btn>
            </template>
          </v-tooltip>
          <v-tooltip location="top" text="Mode IA connecté : agent logistique intelligent qui interroge vos données réelles (commandes, stocks, livraisons).">
            <template #activator="{ props }">
              <v-btn v-bind="props" value="LOGISTICS" size="small">Suivi commandes</v-btn>
            </template>
          </v-tooltip>
        </v-btn-toggle>
        <div class="d-flex align-center">
          <v-textarea
            v-model="promptInput"
            placeholder="Posez votre question sur vos stocks, livraisons..."
            label="Message pour EgoBot"
            aria-label="Saisir votre message pour l'assistant EgoBot"
            variant="outlined"
            density="compact"
            auto-grow
            rows="1"
            max-rows="5"
            hide-details
            class="flex-grow-1 mr-2"
            :disabled="chatStore.isStreaming || chatStore.isLoadingConversation"
            @keydown.enter.exact.prevent="handleSend"
          ></v-textarea>

          <v-btn
            v-if="chatStore.isStreaming"
            icon="mdi-stop"
            color="error"
            variant="flat"
            size="default"
            aria-label="Arrêter la génération"
            title="Arrêter la génération"
            @click="chatStore.cancelCurrentMessage"
          ></v-btn>
          <v-btn
            v-else
            icon="mdi-send"
            color="secondary"
            variant="flat"
            size="default"
            aria-label="Envoyer le message"
            title="Envoyer le message"
            :disabled="!promptInput.trim() || chatStore.isLoadingConversation"
            @click="handleSend"
          ></v-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useChatStore } from "../stores/chat";
import { useAuthStore } from "../stores/auth";
import { useUiStore } from "../stores/ui";
import ChatMessage from "../components/ChatMessage.vue";

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const authStore = useAuthStore();
const uiStore = useUiStore();

const promptInput = ref("");
const selectedModel = ref<"CHATBOT" | "LOGISTICS">("CHATBOT");
const chatBoxRef = ref<HTMLElement | null>(null);

function isMessageCancelled(msg: any): boolean {
  if (!msg) return false;
  if (msg.role !== "ASSISTANT") return false;
  // 1. Marque booléenne explicite
  if (msg.cancelled === true) return true;
  // 2. Marque de statut
  if (msg.status === "CANCELLED") return true;
  // 3. Marque textuelle de repli pour différencier des messages vides en attente normale
  if (typeof msg.content === "string") {
    const trimmed = msg.content.trim();
    if (trimmed === "<cancelled>" || trimmed === "[cancelled]" || trimmed.startsWith("<cancelled>")) {
      return true;
    }
  }
  return false;
}

const visibleMessages = computed(() => {
  return (chatStore.currentConversation?.messages || []).filter(
    (msg: any) => !isMessageCancelled(msg)
  );
});

async function selectConversation(id: string) {
  if (chatStore.currentConversation?.id !== id) {
    chatStore.stopStreaming();
  }
  if (router && route.path !== `/chat/${id}`) {
    router.push(`/chat/${id}`);
  }
  await chatStore.loadConversation(id);
  // Le sélecteur reflète le mode de la conversation ouverte, pour indiquer où
  // l'on se trouve — libre à l'utilisateur d'en changer ensuite.
  const conversationModel = chatStore.currentConversation?.model;
  if (conversationModel === "CHATBOT" || conversationModel === "LOGISTICS") {
    selectedModel.value = conversationModel;
  }
  await scrollToBottom();
}

function handleNewConversation() {
  chatStore.stopStreaming();
  chatStore.currentConversation = null;
  if (router && route.path !== "/chat") {
    router.push("/chat");
  }
}

async function handleSend() {
  if (!promptInput.value.trim() || chatStore.isStreaming) return;
  const text = promptInput.value;
  promptInput.value = "";
  try {
    // Le sélecteur pilote chaque message. Auparavant le modèle de la
    // conversation l'emportait, ce qui figeait le mode à sa création.
    await chatStore.sendMessage(text, selectedModel.value);
    if (router && chatStore.currentConversation?.id && route.path !== `/chat/${chatStore.currentConversation.id}`) {
      router.replace(`/chat/${chatStore.currentConversation.id}`);
    }
    await scrollToBottom();
  } catch (err: any) {
    if (err.response?.status === 401) {
      authStore.logout();
      router.push("/auth");
    } else {
      console.error("Erreur lors de l'envoi du message:", err);
    }
  }
}

async function handleDeleteConversation(id: string) {
  try {
    if (chatStore.currentConversation?.id === id) {
      chatStore.stopStreaming();
      chatStore.currentConversation = null;
    }
    await authStore.sdk.deleteConversation(id);
    await chatStore.loadConversations();
  } catch (err: any) {
    if (err.response?.status === 401) {
      authStore.logout();
      router.push("/auth");
    } else {
      console.error("Erreur lors de la suppression de la conversation:", err);
    }
  }
}

async function scrollToBottom() {
  await nextTick();
  if (chatBoxRef.value) {
    chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight;
  }
}

watch(
  () => route?.params?.id,
  async (newId) => {
    if (newId && typeof newId === "string" && chatStore.currentConversation?.id !== newId) {
      chatStore.stopStreaming();
      await chatStore.loadConversation(newId);
      await scrollToBottom();
    } else if (!newId) {
      chatStore.stopStreaming();
      chatStore.currentConversation = null;
    }
  },
  { immediate: true }
);

onMounted(async () => {
  if (chatStore.conversations.length === 0) {
    try {
      await chatStore.loadConversations();
    } catch {}
  }
});

onUnmounted(() => {
  chatStore.stopStreaming();
});
</script>

<style scoped>
.h-100 {
  height: 100%;
}
.w-50 {
  width: 50%;
}
.w-75 {
  width: 75%;
}
</style>
