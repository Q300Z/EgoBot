import { defineStore } from "pinia";
import { ref } from "vue";
import { parseApiError, type ParsedError, type ParsedErrorDetail } from "../utils/errorParser";

export const useNotificationStore = defineStore("notification", () => {
  const isVisible = ref(false);
  const type = ref<"error" | "warning" | "info" | "success">("info");
  const title = ref("");
  const message = ref("");
  const explanation = ref("");
  const details = ref<ParsedErrorDetail[]>([]);
  const actionText = ref<string | undefined>(undefined);
  const actionCallback = ref<(() => void) | null>(null);
  const isDetailsOpen = ref(false);
  const rawError = ref<unknown>(null);

  function showError(error: unknown, customAction?: { text: string; callback: () => void }) {
    const parsed: ParsedError = parseApiError(error);

    type.value = "error";
    title.value = parsed.title;
    message.value = parsed.message;
    explanation.value = parsed.explanation;
    details.value = parsed.details || [];
    rawError.value = parsed.raw;

    if (customAction) {
      actionText.value = customAction.text;
      actionCallback.value = customAction.callback;
    } else if (parsed.actionText) {
      actionText.value = parsed.actionText;
      actionCallback.value = () => {
        if (parsed.actionType === "reconnect") {
          localStorage.removeItem("token");
          window.location.href = "/";
        } else if (parsed.actionType === "refresh") {
          window.location.reload();
        }
      };
    } else {
      actionText.value = undefined;
      actionCallback.value = null;
    }

    isVisible.value = true;
  }

  function showSuccess(msg: string, heading: string = "Succès") {
    type.value = "success";
    title.value = heading;
    message.value = msg;
    explanation.value = "";
    details.value = [];
    actionText.value = undefined;
    actionCallback.value = null;
    rawError.value = null;
    isVisible.value = true;
  }

  function showWarning(msg: string, expl: string = "", heading: string = "Avertissement") {
    type.value = "warning";
    title.value = heading;
    message.value = msg;
    explanation.value = expl;
    details.value = [];
    actionText.value = undefined;
    actionCallback.value = null;
    rawError.value = null;
    isVisible.value = true;
  }

  function showInfo(msg: string, heading: string = "Information") {
    type.value = "info";
    title.value = heading;
    message.value = msg;
    explanation.value = "";
    details.value = [];
    actionText.value = undefined;
    actionCallback.value = null;
    rawError.value = null;
    isVisible.value = true;
  }

  function triggerAction() {
    if (actionCallback.value) {
      actionCallback.value();
    }
    isVisible.value = false;
  }

  function openDetails() {
    isDetailsOpen.value = true;
  }

  function closeDetails() {
    isDetailsOpen.value = false;
  }

  function close() {
    isVisible.value = false;
  }

  return {
    isVisible,
    type,
    title,
    message,
    explanation,
    details,
    actionText,
    isDetailsOpen,
    rawError,
    showError,
    showSuccess,
    showWarning,
    showInfo,
    triggerAction,
    openDetails,
    closeDetails,
    close,
  };
});
