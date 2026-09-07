<template>
  <v-row justify="center" align="center" class="fill-height ma-0 pa-4">
    <v-col cols="12" sm="8" md="5" lg="4">
      <v-card elevation="8" class="pa-4 rounded-lg border">
        <v-card-item class="text-center">
          <v-avatar color="primary" size="64" class="mb-2">
            <v-icon icon="mdi-truck-delivery-outline" size="36" color="secondary"></v-icon>
          </v-avatar>
          <v-card-title class="text-h5 font-weight-bold">EgoBot</v-card-title>
          <v-card-subtitle>Assistant virtuel EgoNet — Duhamel Logistique</v-card-subtitle>
        </v-card-item>

        <v-card-text>
          <v-tabs v-model="authTab" color="primary" grow class="mb-4">
            <v-tab value="login">Connexion</v-tab>
            <v-tab value="register">Inscription</v-tab>
          </v-tabs>

          <v-alert v-if="authError" type="error" variant="tonal" class="mb-4" closable @click:close="authError = ''">
            {{ authError }}
          </v-alert>

          <v-form @submit.prevent="handleAuthSubmit">
            <v-text-field
              v-model="email"
              label="Adresse Email"
              prepend-inner-icon="mdi-email"
              type="email"
              variant="outlined"
              density="comfortable"
              required
            ></v-text-field>

            <v-text-field
              v-model="password"
              label="Mot de passe"
              prepend-inner-icon="mdi-lock"
              type="password"
              variant="outlined"
              density="comfortable"
              required
            ></v-text-field>

            <v-btn
              type="submit"
              color="primary"
              block
              size="large"
              :loading="authLoading"
              class="mt-2 text-none"
              elevation="2"
            >
              {{ authTab === 'login' ? 'Se Connecter' : "S'inscrire" }}
            </v-btn>
          </v-form>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const authTab = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const authError = ref("");
const authLoading = ref(false);

async function handleAuthSubmit() {
  authError.value = "";
  authLoading.value = true;
  try {
    if (authTab.value === "login") {
      await authStore.login(email.value, password.value);
    } else {
      // Pas de rôle : l'inscription publique crée toujours un compte USER.
      await authStore.register(email.value, password.value);
    }
    await chatStore.loadConversations();
    router.push("/chat");
  } catch (err: any) {
    authError.value = err.response?.data?.error || err.message || "Erreur d'authentification";
  } finally {
    authLoading.value = false;
  }
}
</script>
