import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import vuetify from "../plugins/vuetify";
import { router } from "../router/index";
import App from "../App.vue";
import { useAuthStore } from "../stores/auth";

// Polyfill visualViewport pour JSDOM (requis par VOverlay/VSnackbar de Vuetify)
if (typeof window !== "undefined" && !window.visualViewport) {
  (window as any).visualViewport = {
    width: 1024,
    height: 768,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

describe("App.vue Root Layout", () => {
  let pinia: any;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
  });

  function createWrapper() {
    return mount(App, {
      global: {
        plugins: [pinia, router, vuetify],
        stubs: {
          GlobalNotification: true,
        },
      },
    });
  }

  it("renders AuthView when user is not authenticated", () => {
    const authStore = useAuthStore();
    authStore.token = null;

    const wrapper = createWrapper();
    expect(wrapper.text()).toContain("EgoBot");
    expect(wrapper.text()).toContain("Connexion");
    expect(wrapper.text()).toContain("Inscription");
  });

  it("renders AppBar when authenticated", async () => {
    const authStore = useAuthStore();
    authStore.token = "valid-token";
    authStore.user = { id: "u1", email: "user@test.com", role: "USER" };

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.text()).toContain("EgoBot");
    expect(wrapper.text()).toContain("user@test.com");
  });

  it("logs out on mounted if fetchMe throws an error", async () => {
    const authStore = useAuthStore();
    authStore.token = "invalid-token";

    vi.spyOn(authStore, "fetchMe").mockRejectedValue(new Error("Token expired"));
    const logoutSpy = vi.spyOn(authStore, "logout");

    createWrapper();
    await flushPromises();

    expect(logoutSpy).toHaveBeenCalled();
  });
});
