<template>
  <v-app-bar v-if="authStore.token" color="surface" elevation="2">
    <v-app-bar-title class="font-weight-bold d-flex align-center">
      <v-icon icon="mdi-truck-delivery-outline" color="secondary" class="mr-2" aria-hidden="true"></v-icon>
      <span>EgoBot</span>
      <v-chip size="x-small" color="secondary" variant="flat" class="ml-2 font-weight-bold text-white">
        EgoNet — Duhamel Logistique
      </v-chip>
    </v-app-bar-title>

    <v-spacer></v-spacer>

    <!-- Info Utilisateur -->
    <v-chip color="primary" variant="tonal" class="mr-2">
      <v-icon start icon="mdi-account"></v-icon>
      {{ authStore.user?.email || 'Utilisateur' }}
    </v-chip>
    <v-chip :color="authStore.user?.role === 'ADMIN' ? 'warning' : 'info'" variant="flat" size="small" class="mr-4 text-white font-weight-bold">
      {{ authStore.user?.role }}
    </v-chip>

    <!-- Actions de Navigation Vue Router -->
    <v-btn
      variant="text"
      :color="isRouteActive('/chat') ? 'primary' : undefined"
      prepend-icon="mdi-chat"
      @click="navigateTo('/chat')"
    >
      Chat
    </v-btn>

    <v-btn
      v-if="authStore.user?.role === 'ADMIN'"
      variant="text"
      :color="isRouteActive('/admin') ? 'warning' : undefined"
      prepend-icon="mdi-shield-account"
      @click="navigateTo('/admin')"
    >
      Backoffice
    </v-btn>

    <v-btn
      v-if="authStore.user?.role === 'ADMIN'"
      variant="text"
      :color="isRouteActive('/debug') ? 'accent' : undefined"
      prepend-icon="mdi-bug-outline"
      @click="navigateTo('/debug')"
    >
      EventBus Live
    </v-btn>

    <!-- Sélecteur de Thème -->
    <ThemeSelector />

    <v-btn color="error" variant="outlined" prepend-icon="mdi-logout" class="ml-2" @click="handleLogout">
      Déconnexion
    </v-btn>
  </v-app-bar>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import ThemeSelector from "./ThemeSelector.vue";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

function isRouteActive(pathPrefix: string): boolean {
  return route?.path?.startsWith(pathPrefix) ?? false;
}

function navigateTo(path: string) {
  if (router && route && route.path !== path) {
    router.push(path);
  }
}

function handleLogout() {
  authStore.logout();
  router.push("/login");
}
</script>
