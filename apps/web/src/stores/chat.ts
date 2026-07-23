import { defineStore } from "pinia";
import { ref } from "vue";
import { useAuthStore } from "./auth.js";

export const useChatStore = defineStore("chat", () => {
  const authStore = useAuthStore();
  const conversations = ref<any[]>([]);
  const currentConversation = ref<any | null>(null);
  const isStreaming = ref(false);
  const activeStreamCleanup = ref<(() => void) | null>(null);

  async function loadConversations() {
    conversations.value = await authStore.sdk.getConversations();
  }

  async function loadConversation(id: string) {
    currentConversation.value = await authStore.sdk.getConversation(id);
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
    } else {
      currentConversation.value.messages.push({ role: "USER", content: prompt });
      currentConversation.value.messages.push({ role: "ASSISTANT", content: "" });
    }

    isStreaming.value = true;
    let receivedAnyToken = false;
    let fallbackTimer: any = null;

    // Timer de Fallback SSE (6s d'inactivité)
    fallbackTimer = setTimeout(async () => {
      if (!receivedAnyToken) {
        console.warn("[ChatStore] Fallback SSE activé -> Passage en Batch HTTP Polling");
        if (activeStreamCleanup.value) activeStreamCleanup.value();
        isStreaming.value = false;
        await loadConversation(jobResult.conversation_id);
      }
    }, 6000);

    const cleanup = authStore.sdk.connectJobStream(jobResult.job_id, {
      onToken: (chunk) => {
        receivedAnyToken = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);

        const lastMsg = currentConversation.value?.messages[currentConversation.value.messages.length - 1];
        if (lastMsg && lastMsg.role === "ASSISTANT") {
          lastMsg.content += chunk;
        }
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
    loadConversations,
    loadConversation,
    sendMessage,
  };
});
