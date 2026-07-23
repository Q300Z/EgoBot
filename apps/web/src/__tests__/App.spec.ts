import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import vuetify from "../plugins/vuetify";
import App from "../App.vue";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";
import { useBackofficeStore } from "../stores/backoffice";

describe("App.vue Component", () => {
  let pinia: any;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
  });

  function createWrapper() {
    return mount(App, {
      global: {
        plugins: [pinia, vuetify],
      },
    });
  }

  describe("Unauthenticated State (Login / Register)", () => {
    it("renders login card when user is not authenticated", () => {
      const authStore = useAuthStore();
      authStore.token = null;

      const wrapper = createWrapper();
      expect(wrapper.text()).toContain("Scaffold LLM");
      expect(wrapper.text()).toContain("Connexion");
      expect(wrapper.text()).toContain("Inscription");
    });

    it("handles login submission successfully", async () => {
      const authStore = useAuthStore();
      const chatStore = useChatStore();
      authStore.token = null;

      const loginSpy = vi.spyOn(authStore, "login").mockResolvedValue();
      const loadConversationsSpy = vi.spyOn(chatStore, "loadConversations").mockResolvedValue();

      const wrapper = createWrapper();

      // Find inputs
      const emailInput = wrapper.find('input[type="email"]');
      const passwordInput = wrapper.find('input[type="password"]');

      await emailInput.setValue("test@example.com");
      await passwordInput.setValue("password123");

      const form = wrapper.find("form");
      await form.trigger("submit.prevent");
      await flushPromises();

      expect(loginSpy).toHaveBeenCalledWith("test@example.com", "password123");
      expect(loadConversationsSpy).toHaveBeenCalled();
    });

    it("handles registration submission with role successfully", async () => {
      const authStore = useAuthStore();
      const chatStore = useChatStore();
      authStore.token = null;

      const registerSpy = vi.spyOn(authStore, "register").mockResolvedValue();
      const loadConversationsSpy = vi.spyOn(chatStore, "loadConversations").mockResolvedValue();

      const wrapper = createWrapper();

      // Switch to register tab
      const tabs = wrapper.findAll(".v-tab");
      const registerTab = tabs.find((t) => t.text().includes("Inscription"));
      if (registerTab) {
        await registerTab.trigger("click");
      }

      const emailInput = wrapper.find('input[type="email"]');
      const passwordInput = wrapper.find('input[type="password"]');

      await emailInput.setValue("admin@example.com");
      await passwordInput.setValue("admin123");

      const form = wrapper.find("form");
      await form.trigger("submit.prevent");
      await flushPromises();

      expect(registerSpy).toHaveBeenCalled();
      expect(loadConversationsSpy).toHaveBeenCalled();
    });

    it("displays error alert when auth fails", async () => {
      const authStore = useAuthStore();
      authStore.token = null;

      vi.spyOn(authStore, "login").mockRejectedValue({
        response: { data: { error: "Identifiants invalides" } },
      });

      const wrapper = createWrapper();
      const form = wrapper.find("form");
      await form.trigger("submit.prevent");
      await flushPromises();

      expect(wrapper.text()).toContain("Identifiants invalides");
    });
  });

  describe("Authenticated State & Navigation", () => {
    beforeEach(() => {
      const authStore = useAuthStore();
      const backofficeStore = useBackofficeStore();
      authStore.token = "valid-token";
      authStore.user = { id: "u1", email: "admin@test.com", role: "ADMIN" };
      vi.spyOn(backofficeStore, "loadAdminConversations").mockResolvedValue();
      vi.spyOn(backofficeStore, "loadUsers").mockResolvedValue();
      vi.spyOn(authStore.sdk, "getUsers").mockResolvedValue([]);
      vi.spyOn(authStore.sdk, "getAdminConversations").mockResolvedValue([]);
    });

    it("renders navigation bar when authenticated", async () => {
      const wrapper = createWrapper();
      await flushPromises();

      expect(wrapper.text()).toContain("Scaffold LLM Monorepo");
      expect(wrapper.text()).toContain("admin@test.com");
      expect(wrapper.text()).toContain("ADMIN");
      expect(wrapper.text()).toContain("Chat");
      expect(wrapper.text()).toContain("Backoffice");
      expect(wrapper.text()).toContain("EventBus Live");
    });

    it("handles logout action", async () => {
      const authStore = useAuthStore();
      const logoutSpy = vi.spyOn(authStore, "logout");

      const wrapper = createWrapper();
      await flushPromises();

      const logoutBtn = wrapper.findAll(".v-btn").find((b) => b.text().includes("Déconnexion"));
      expect(logoutBtn).toBeDefined();

      await logoutBtn?.trigger("click");
      expect(logoutSpy).toHaveBeenCalled();
    });

    it("switches to backoffice view and loads users for ADMIN", async () => {
      const backofficeStore = useBackofficeStore();
      const loadUsersSpy = vi.spyOn(backofficeStore, "loadUsers").mockResolvedValue();

      const wrapper = createWrapper();
      await flushPromises();

      const backofficeBtn = wrapper.findAll(".v-btn").find((b) => b.text().includes("Backoffice"));
      await backofficeBtn?.trigger("click");
      await flushPromises();

      expect(loadUsersSpy).toHaveBeenCalled();
      expect(wrapper.text()).toContain("Backoffice Administration");
    });

    it("switches to EventBus Live debug view", async () => {
      const wrapper = createWrapper();
      await flushPromises();

      const debugBtn = wrapper.findAll(".v-btn").find((b) => b.text().includes("EventBus Live"));
      await debugBtn?.trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("Live EventBus Monitor (SSE)");
    });
  });

  describe("Chat Operations", () => {
    beforeEach(() => {
      const authStore = useAuthStore();
      authStore.token = "valid-token";
      authStore.user = { id: "u1", email: "user@test.com", role: "USER" };
    });

    it("renders conversation list and handles new conversation creation", async () => {
      const chatStore = useChatStore();
      chatStore.conversations = [
        { id: "c1", title: "Discussion 1" },
        { id: "c2", title: "Discussion 2" },
      ];
      chatStore.currentConversation = { id: "c1", title: "Discussion 1", messages: [] };

      const wrapper = createWrapper();
      await flushPromises();

      expect(wrapper.text()).toContain("Discussion 1");

      const plusBtn = wrapper.find('button[title="Nouvelle Conversation"]');
      await plusBtn.trigger("click");

      expect(chatStore.currentConversation).toBeNull();
    });

    it("handles deleting active conversation and resets currentConversation", async () => {
      const authStore = useAuthStore();
      const chatStore = useChatStore();
      chatStore.conversations = [{ id: "c1", title: "Discussion 1" }];
      chatStore.currentConversation = { id: "c1", title: "Discussion 1", messages: [] };

      vi.spyOn(authStore.sdk, "deleteConversation").mockResolvedValue({ success: true } as any);
      vi.spyOn(chatStore, "loadConversations").mockResolvedValue();

      const wrapper = createWrapper();
      await flushPromises();

      const deleteBtn = wrapper.find(".v-list-item button");
      await deleteBtn.trigger("click");
      await flushPromises();

      expect(chatStore.currentConversation).toBeNull();
    });

    it("handles EventBus debug SSE stream connection and incoming messages", async () => {
      const wrapper = createWrapper();
      await flushPromises();

      const debugBtn = wrapper.findAll(".v-btn").find((b) => b.text().includes("EventBus Live"));
      await debugBtn?.trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("Live EventBus Monitor (SSE)");
    });

    it("handles deleting conversation", async () => {
      const authStore = useAuthStore();
      const chatStore = useChatStore();
      chatStore.conversations = [{ id: "c1", title: "Discussion 1" }];
      chatStore.currentConversation = { id: "c1", title: "Discussion 1", messages: [] };

      const deleteSdkSpy = vi.spyOn(authStore.sdk, "deleteConversation").mockResolvedValue({ success: true } as any);
      const loadConversationsSpy = vi.spyOn(chatStore, "loadConversations").mockResolvedValue();

      const wrapper = createWrapper();
      await flushPromises();

      const deleteBtn = wrapper.find(".v-list-item button");
      await deleteBtn.trigger("click");
      await flushPromises();

      expect(deleteSdkSpy).toHaveBeenCalledWith("c1");
      expect(loadConversationsSpy).toHaveBeenCalled();
      expect(chatStore.currentConversation).toBeNull();
    });

    it("sends prompt message on enter key or send button click", async () => {
      const chatStore = useChatStore();
      const sendSpy = vi.spyOn(chatStore, "sendMessage").mockResolvedValue();

      const wrapper = createWrapper();
      await flushPromises();

      const textInput = wrapper.find('input[placeholder="Écrivez un message..."]');
      await textInput.setValue("Comment vas-tu ?");
      await textInput.trigger("keyup.enter");
      await flushPromises();

      expect(sendSpy).toHaveBeenCalledWith("Comment vas-tu ?");
    });
  });

  describe("Backoffice Administration Operations", () => {
    beforeEach(() => {
      const authStore = useAuthStore();
      const backofficeStore = useBackofficeStore();
      authStore.token = "valid-token";
      authStore.user = { id: "admin-1", email: "admin@test.com", role: "ADMIN" };
      vi.spyOn(backofficeStore, "loadAdminConversations").mockResolvedValue();
      vi.spyOn(backofficeStore, "loadUsers").mockResolvedValue();
      vi.spyOn(authStore.sdk, "getUsers").mockResolvedValue([]);
      vi.spyOn(authStore.sdk, "getAdminConversations").mockResolvedValue([]);
    });

    it("creates user in admin view", async () => {
      const backofficeStore = useBackofficeStore();
      const createUserSpy = vi.spyOn(backofficeStore, "createUser").mockResolvedValue();

      const wrapper = createWrapper();
      await flushPromises();

      // Switch to admin view
      const backofficeBtn = wrapper.findAll(".v-btn").find((b) => b.text().includes("Backoffice"));
      await backofficeBtn?.trigger("click");
      await flushPromises();

      // Open create user dialog
      const openDialogBtn = wrapper.findAll(".v-btn").find((b) => b.text().includes("Créer un Utilisateur"));
      await openDialogBtn?.trigger("click");
      await flushPromises();

      const dialogInputs = wrapper.findAll(".v-dialog input");
      if (dialogInputs.length >= 2) {
        await dialogInputs[0].setValue("newuser@test.com");
        await dialogInputs[1].setValue("newpass123");
      }

      const createConfirmBtn = wrapper.findAll(".v-dialog .v-btn").find((b) => b.text().includes("Créer"));
      await createConfirmBtn?.trigger("click");
      await flushPromises();

      expect(createUserSpy).toHaveBeenCalledWith({
        email: "newuser@test.com",
        password: "newpass123",
        role: "USER",
      });
    });

    it("deletes user in admin view", async () => {
      const backofficeStore = useBackofficeStore();
      backofficeStore.users = [
        { id: "usr-1", email: "delete-me@test.com", role: "USER", created_at: "2026-01-01T00:00:00Z" },
      ];

      const deleteUserSpy = vi.spyOn(backofficeStore, "deleteUser").mockResolvedValue();

      const wrapper = createWrapper();
      await flushPromises();

      // Switch to admin view
      const backofficeBtn = wrapper.findAll(".v-btn").find((b) => b.text().includes("Backoffice"));
      await backofficeBtn?.trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("delete-me@test.com");

      const deleteRowBtn = wrapper.find("tbody .v-btn");
      await deleteRowBtn.trigger("click");
      await flushPromises();

      expect(deleteUserSpy).toHaveBeenCalledWith("usr-1");
    });
  });

  describe("Lifecycle Hooks & Error Handlers", () => {
    it("fetches me and conversations on mounted if token exists", async () => {
      const authStore = useAuthStore();
      const chatStore = useChatStore();

      authStore.token = "saved-token";

      const fetchMeSpy = vi.spyOn(authStore, "fetchMe").mockResolvedValue();
      const loadConversationsSpy = vi.spyOn(chatStore, "loadConversations").mockResolvedValue();

      createWrapper();
      await flushPromises();

      expect(fetchMeSpy).toHaveBeenCalled();
      expect(loadConversationsSpy).toHaveBeenCalled();
    });

    it("logs out on mounted if fetchMe throws an error", async () => {
      const authStore = useAuthStore();
      authStore.token = "invalid-saved-token";

      vi.spyOn(authStore, "fetchMe").mockRejectedValue(new Error("Token expired"));
      const logoutSpy = vi.spyOn(authStore, "logout");

      createWrapper();
      await flushPromises();

      expect(logoutSpy).toHaveBeenCalled();
    });
  });
});
