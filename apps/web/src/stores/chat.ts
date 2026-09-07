import { defineStore } from "pinia";
import { ref } from "vue";
import { useAuthStore } from "./auth.js";

export const useChatStore = defineStore("chat", () => {
  const authStore = useAuthStore();
  const conversations = ref<any[]>([]);
  const currentConversation = ref<any | null>(null);
  const isStreaming = ref(false);
  const isLoadingConversations = ref(false);
  const isLoadingConversation = ref(false);
  const activeStreamCleanup = ref<(() => void) | null>(null);

  async function loadConversations() {
    isLoadingConversations.value = true;
    try {
      conversations.value = await authStore.sdk.getConversations();
    } finally {
      isLoadingConversations.value = false;
    }
  }

  async function loadConversation(id: string) {
    isLoadingConversation.value = true;
    try {
      currentConversation.value = await authStore.sdk.getConversation(id);
    } finally {
      isLoadingConversation.value = false;
    }
  }

  async function sendMessage(prompt: string, model: string = "CHATBOT") {
    if (activeStreamCleanup.value) {
      activeStreamCleanup.value();
    }

    const jobResult = await authStore.sdk.createMessage(
      prompt,
      currentConversation.value?.id,
      model
    );

    if (!currentConversation.value) {
      await loadConversation(jobResult.conversation_id);
      await loadConversations();
    } else {
      currentConversation.value.messages.push({ role: "USER", content: prompt });
      currentConversation.value.messages.push({ role: "ASSISTANT", content: "" });
    }

    isStreaming.value = true;
    let receivedAnyToken = false;
    let fallbackTimer: any = null;

    fallbackTimer = setTimeout(async () => {
      if (!receivedAnyToken) {
        console.warn("[ChatStore] Fallback SSE activé -> Passage en Batch HTTP Polling (aucun token reçu après 20s)");
        if (activeStreamCleanup.value) activeStreamCleanup.value();
        isStreaming.value = false;
        await loadConversation(jobResult.conversation_id);
      }
    }, 20000);

    const cleanup = authStore.sdk.connectJobStream(jobResult.job_id, {
      onToken: (chunk) => {
        receivedAnyToken = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);

        const lastMsg = currentConversation.value?.messages[currentConversation.value.messages.length - 1];
        if (lastMsg && lastMsg.role === "ASSISTANT") {
          lastMsg.content += chunk;
        }
      },
      onSource: (_source) => {
        receivedAnyToken = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
      },
      onStatus: async (status) => {
        if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
          if (fallbackTimer) clearTimeout(fallbackTimer);
          isStreaming.value = false;
          await loadConversation(jobResult.conversation_id);
          await loadConversations();
        }
      },
      onError: async () => {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        isStreaming.value = false;
      },
    });

    activeStreamCleanup.value = cleanup;
  }

  return {
    conversations,
    currentConversation,
    isStreaming,
    isLoadingConversations,
    isLoadingConversation,
    activeStreamCleanup,
    loadConversations,
    loadConversation,
    sendMessage,
  };
});
