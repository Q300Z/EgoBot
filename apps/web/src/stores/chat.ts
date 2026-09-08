import { defineStore } from "pinia";
import { ref } from "vue";
import { useAuthStore } from "./auth.js";
import { useNotificationStore } from "./notification.js";

export const useChatStore = defineStore("chat", () => {
  const authStore = useAuthStore();
  const notificationStore = useNotificationStore();

  const conversations = ref<any[]>([]);
  const currentConversation = ref<any | null>(null);
  const isStreaming = ref(false);
  const isLoadingConversations = ref(false);
  const isLoadingConversation = ref(false);
  const activeStreamCleanup = ref<(() => void) | null>(null);
  const currentJobId = ref<string | null>(null);

  async function loadConversations() {
    isLoadingConversations.value = true;
    try {
      conversations.value = await authStore.sdk.getConversations();
    } catch (err: any) {
      if (err.response?.status !== 401) {
        notificationStore.showError(err, {
          text: "Réessayer",
          callback: () => loadConversations(),
        });
      }
    } finally {
      isLoadingConversations.value = false;
    }
  }

  function stopStreaming() {
    if (activeStreamCleanup.value) {
      activeStreamCleanup.value();
      activeStreamCleanup.value = null;
    }
    isStreaming.value = false;
    currentJobId.value = null;
  }

  async function cancelCurrentMessage() {
    const jobIdToCancel = currentJobId.value;
    if (!jobIdToCancel) {
      stopStreaming();
      return;
    }

    try {
      await authStore.sdk.cancelMessage(jobIdToCancel);
      notificationStore.showInfo(
        "La génération du message a été interrompue.",
        "Génération arrêtée"
      );
    } catch (err: any) {
      notificationStore.showError(err);
    } finally {
      stopStreaming();
      if (currentConversation.value?.id) {
        await loadConversation(currentConversation.value.id, { silent: true });
      }
    }
  }

  async function loadConversation(id: string, options?: { silent?: boolean }) {
    if (currentConversation.value?.id !== id && isStreaming.value) {
      stopStreaming();
    }
    const silent = options?.silent ?? false;
    if (!silent) {
      isLoadingConversation.value = true;
    }
    try {
      currentConversation.value = await authStore.sdk.getConversation(id);
    } catch (err: any) {
      if (err.response?.status !== 401) {
        notificationStore.showError(err, {
          text: "Réessayer",
          callback: () => loadConversation(id, options),
        });
      }
    } finally {
      if (!silent) {
        isLoadingConversation.value = false;
      }
    }
  }

  async function sendMessage(prompt: string, model: string = "CHATBOT") {
    if (activeStreamCleanup.value) {
      activeStreamCleanup.value();
    }

    let jobResult: any;
    try {
      jobResult = await authStore.sdk.createMessage(
        prompt,
        currentConversation.value?.id,
        model
      );
    } catch (err: any) {
      notificationStore.showError(err, {
        text: "Réessayer",
        callback: () => sendMessage(prompt, model),
      });
      throw err;
    }

    if (!currentConversation.value) {
      await loadConversation(jobResult.conversation_id, { silent: true });
      await loadConversations();
    } else {
      currentConversation.value.messages.push({ role: "USER", content: prompt });
      currentConversation.value.messages.push({ role: "ASSISTANT", content: "" });
    }

    isStreaming.value = true;
    currentJobId.value = jobResult.job_id;
    let receivedAnyToken = false;
    let fallbackTimer: any = null;

    fallbackTimer = setTimeout(async () => {
      if (!receivedAnyToken) {
        console.warn("[ChatStore] Fallback SSE activé -> Passage en Batch HTTP Polling (aucun token reçu après 20s)");
        if (activeStreamCleanup.value) activeStreamCleanup.value();
        isStreaming.value = false;
        currentJobId.value = null;
        await loadConversation(jobResult.conversation_id, { silent: true });
      }
    }, 20000);

    const cleanup = authStore.sdk.connectJobStream(jobResult.job_id, {
      onToken: (chunk: string) => {
        receivedAnyToken = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);

        const lastMsg = currentConversation.value?.messages[currentConversation.value.messages.length - 1];
        if (lastMsg && lastMsg.role === "ASSISTANT") {
          lastMsg.content += chunk;
        }
      },
      onSource: (_source: any) => {
        receivedAnyToken = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
      },
      onStatus: async (status: string) => {
        if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
          if (fallbackTimer) clearTimeout(fallbackTimer);
          isStreaming.value = false;
          currentJobId.value = null;
          if (activeStreamCleanup.value) {
            activeStreamCleanup.value();
            activeStreamCleanup.value = null;
          }
          if (status === "FAILED") {
            notificationStore.showError(
              new Error("Le modèle d'intelligence artificielle a rencontré une erreur lors de la génération de la réponse.")
            );
          }
          await loadConversation(jobResult.conversation_id, { silent: true });
          await loadConversations();
        }
      },
      onError: async () => {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        // Si le streaming était déjà terminé (normalement ou par annulation), la clôture HTTP n'est pas une erreur
        if (!isStreaming.value) return;
        isStreaming.value = false;
        currentJobId.value = null;
        if (activeStreamCleanup.value) {
          activeStreamCleanup.value();
          activeStreamCleanup.value = null;
        }
        notificationStore.showWarning(
          "Flux temps réel interrompu",
          "La connexion de streaming a été coupée. Nous basculons sur la récupération des données en arrière-plan."
        );
      },
    });

    activeStreamCleanup.value = cleanup;
  }

  return {
    conversations,
    currentConversation,
    isStreaming,
    currentJobId,
    isLoadingConversations,
    isLoadingConversation,
    activeStreamCleanup,
    loadConversations,
    loadConversation,
    sendMessage,
    cancelCurrentMessage,
    stopStreaming,
  };
});
