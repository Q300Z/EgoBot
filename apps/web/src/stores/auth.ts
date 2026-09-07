import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { EgobotClientSDK } from "@egobot/sdk/client";

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem("token"));
  const user = ref<any | null>(null);

  const sdk = computed(() => {
    return new EgobotClientSDK({
      baseUrl: "http://localhost:8000",
      token: token.value || undefined,
    });
  });

  async function login(identifier: string, pass: string) {
    const data = await sdk.value.login(identifier, pass);
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem("token", data.token);
  }

  async function register(email: string, pass: string, role?: string, username?: string) {
    const data = await sdk.value.register(email, pass, role, username);
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem("token", data.token);
  }

  async function fetchMe() {
    if (!token.value) return;
    try {
      user.value = await sdk.value.getMe();
    } catch {
      logout();
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem("token");
  }

  return { token, user, sdk, login, register, fetchMe, logout };
});
