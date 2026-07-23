<template>
  <v-app-bar v-if="authStore.token" color="surface" elevation="2" density="comfortable">
    <v-app-bar-nav-icon
      v-if="isRouteActive('/chat')"
      aria-label="Basculer l'historique des conversations"
      title="Historique des conversations"
      @click="uiStore.toggleDrawer"
    ></v-app-bar-nav-icon>

    <v-app-bar-title class="font-weight-bold d-flex align-center text-truncate">
      <v-icon icon="mdi-truck-delivery-outline" color="secondary" class="mr-2" aria-hidden="true"></v-icon>
      <span>EgoBot</span>
      <v-chip size="x-small" color="secondary" variant="flat" class="ml-2 font-weight-bold text-white d-none d-sm-inline-flex">
        EgoNet — Duhamel Logistique
      </v-chip>
    </v-app-bar-title>

    <v-spacer></v-spacer>

    <!-- Info Utilisateur (masqué sur très petit écran d'iframe) -->
    <v-chip color="primary" variant="tonal" class="mr-2 d-none d-md-inline-flex">
      <v-icon start icon="mdi-account"></v-icon>
      {{ authStore.user?.email || 'Utilisateur' }}
    </v-chip>
    <v-chip :color="authStore.user?.role === 'ADMIN' ? 'warning' : 'info'" variant="flat" size="small" class="mr-2 text-white font-weight-bold d-none d-sm-inline-flex">
      {{ authStore.user?.role }}
    </v-chip>

    <!-- Actions de Navigation Vue Router -->
    <v-btn
      variant="text"
      :color="isRouteActive('/chat') ? 'primary' : undefined"
      prepend-icon="mdi-chat"
      size="small"
      @click="navigateTo('/chat')"
    >
      Chat
    </v-btn>

    <v-btn
      v-if="authStore.user?.role === 'ADMIN'"
      variant="text"
      :color="isRouteActive('/admin') ? 'warning' : undefined"
      prepend-icon="mdi-shield-account"
      size="small"
      @click="navigateTo('/admin')"
    >
      Backoffice
    </v-btn>

    <!-- Sélecteur de Thème -->
    <ThemeSelector />

    <v-btn color="error" variant="text" icon="mdi-logout" size="small" aria-label="Déconnexion" title="Déconnexion" @click="handleLogout"></v-btn>
  </v-app-bar>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useUiStore } from "../stores/ui";
import ThemeSelector from "./ThemeSelector.vue";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const uiStore = useUiStore();

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
