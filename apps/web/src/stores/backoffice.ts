import { defineStore } from "pinia";
import { ref } from "vue";
import { useAuthStore } from "./auth.js";

export const useBackofficeStore = defineStore("backoffice", () => {
  const authStore = useAuthStore();
  const users = ref<any[]>([]);

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

  return { users, loadUsers, createUser, updateUser, deleteUser };
});
