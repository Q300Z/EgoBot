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

  async function deleteUser(id: string) {
    await authStore.sdk.deleteUser(id);
    await loadUsers();
  }

  return { users, loadUsers, createUser, deleteUser };
});
