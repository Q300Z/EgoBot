import { defineStore } from "pinia";
import { ref } from "vue";
import { useAuthStore } from "./auth.js";

export const useBackofficeStore = defineStore("backoffice", () => {
  const authStore = useAuthStore();
  const users = ref<any[]>([]);
  const adminConversations = ref<any[]>([]);
  const userConversations = ref<any[]>([]);

  async function loadUsers() {
    users.value = await authStore.sdk.getUsers();
  }

  async function createUser(data: { email: string; password: string; role: string }) {
    await authStore.sdk.createUser(data);
    await loadUsers();
  }

  async function updateUser(id: string, data: { email?: string; role?: string; resetPassword?: boolean }) {
    const result = await authStore.sdk.updateUser(id, data);
    await loadUsers();
    return result; // contient éventuellement { generatedPassword }
  }

  async function deleteUser(id: string) {
    await authStore.sdk.deleteUser(id);
    await loadUsers();
  }

  async function loadAdminConversations(userId?: string) {
    adminConversations.value = await authStore.sdk.getAdminConversations(userId);
  }

  async function loadUserConversations(userId: string) {
    userConversations.value = await authStore.sdk.getUserConversations(userId);
    return userConversations.value;
  }

  async function getAdminConversation(id: string) {
    return await authStore.sdk.getAdminConversation(id);
  }

  return {
    users,
    adminConversations,
    userConversations,
    loadUsers,
    createUser,
    updateUser,
    deleteUser,
    loadAdminConversations,
    loadUserConversations,
    getAdminConversation,
  };
});
