<template>
  <v-app>
    <AppBar />
    <v-main>
      <v-container fluid class="fill-height pa-0">
        <AuthView v-if="!authStore.token" />
        <router-view v-else v-slot="{ Component }">
          <v-fade-transition mode="out-in">
            <component :is="Component" />
          </v-fade-transition>
        </router-view>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useAuthStore } from "./stores/auth";
import AppBar from "./components/AppBar.vue";
import AuthView from "./views/AuthView.vue";

const authStore = useAuthStore();

onMounted(async () => {
  if (authStore.token) {
    try {
      await authStore.fetchMe();
    } catch {
      authStore.logout();
    }
  }
});
</script>
