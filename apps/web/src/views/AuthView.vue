<template>
  <v-row justify="center" align="center" class="fill-height ma-0 pa-4">
    <v-col cols="12" sm="10" md="6" lg="5">
      <v-card elevation="8" class="pa-4 rounded-lg border">
        <v-card-item class="text-center">
          <v-avatar color="primary" size="64" class="mb-2">
            <v-icon icon="mdi-truck-delivery-outline" size="36" color="secondary"></v-icon>
          </v-avatar>
          <v-card-title class="text-h5 font-weight-bold">EgoBot</v-card-title>
          <v-card-subtitle>Assistant virtuel EgoNet — Duhamel Logistique</v-card-subtitle>
        </v-card-item>

        <v-card-text>
          <v-tabs v-model="authTab" color="primary" grow class="mb-4" @update:model-value="onTabChange">
            <v-tab value="login">Connexion</v-tab>
            <v-tab value="register">Inscription</v-tab>
          </v-tabs>

          <v-alert
            v-if="authError"
            type="error"
            variant="tonal"
            class="mb-4"
            closable
            @click:close="authError = ''"
          >
            {{ authError }}
          </v-alert>

          <v-alert
            v-if="generatedNotice"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
            closable
            @click:close="generatedNotice = false"
          >
            <v-icon icon="mdi-information-outline" class="mr-1"></v-icon>
            Mot de passe sécurisé généré automatiquement. Pensez à le conserver précieusement.
          </v-alert>

          <v-form ref="formRef" v-model="isFormValid" @submit.prevent="handleAuthSubmit">
            <!-- Onglet Connexion -->
            <template v-if="authTab === 'login'">
              <v-text-field
                v-model="loginIdentifier"
                label="Identifiant (Email ou nom d'utilisateur)"
                prepend-inner-icon="mdi-account"
                type="text"
                variant="outlined"
                density="comfortable"
                :rules="loginIdentifierRules"
                required
              ></v-text-field>
            </template>

            <!-- Onglet Inscription -->
            <template v-else>
              <v-text-field
                v-model="email"
                label="Adresse Email"
                prepend-inner-icon="mdi-email"
                type="email"
                placeholder="utilisateur@domaine.com"
                variant="outlined"
                density="comfortable"
                :rules="emailRules"
                required
              ></v-text-field>

              <v-text-field
                v-model="username"
                label="Nom d'utilisateur (optionnel)"
                prepend-inner-icon="mdi-account"
                type="text"
                placeholder="ex: JeanDupont"
                variant="outlined"
                density="comfortable"
                :rules="usernameRules"
              ></v-text-field>
            </template>

            <!-- Champ Mot de passe (Commun avec visibilité et règles adaptées) -->
            <div class="d-flex justify-space-between align-center mb-1">
              <span class="text-caption font-weight-medium text-medium-emphasis">
                {{ authTab === 'register' ? 'Création du mot de passe' : 'Mot de passe' }}
              </span>
              <v-btn
                v-if="authTab === 'register'"
                variant="text"
                density="compact"
                size="small"
                color="secondary"
                class="text-caption px-1 font-weight-bold"
                prepend-icon="mdi-dice-5-outline"
                @click="generateStrongPassword"
              >
                Générer un mot de passe fort
              </v-btn>
            </div>

            <v-text-field
              v-model="password"
              :label="authTab === 'register' ? 'Nouveau mot de passe' : 'Mot de passe'"
              prepend-inner-icon="mdi-lock"
              :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
              :type="showPassword ? 'text' : 'password'"
              variant="outlined"
              density="comfortable"
              :rules="passwordRules"
              autocomplete="new-password"
              required
              @click:append-inner="showPassword = !showPassword"
            ></v-text-field>

            <!-- Indicateur de force et exigences (Onglet Inscription uniquement) -->
            <template v-if="authTab === 'register' && password">
              <div class="mb-3 pa-3 rounded bg-surface-variant">
                <div class="d-flex justify-space-between align-center mb-1">
                  <span class="text-caption font-weight-medium">Force du mot de passe :</span>
                  <v-chip
                    size="x-small"
                    :color="passwordStrength.color"
                    variant="flat"
                    class="font-weight-bold"
                  >
                    {{ passwordStrength.label }}
                  </v-chip>
                </div>

                <v-progress-linear
                  :model-value="passwordStrength.score * 25"
                  :color="passwordStrength.color"
                  height="6"
                  rounded
                  class="mb-3"
                ></v-progress-linear>

                <div class="d-flex flex-column gap-1">
                  <div
                    v-for="(rule, idx) in passwordCriteria"
                    :key="idx"
                    class="d-flex align-center text-caption"
                    :class="rule.valid ? 'text-success' : 'text-medium-emphasis'"
                  >
                    <v-icon
                      :icon="rule.valid ? 'mdi-check-circle' : 'mdi-circle-outline'"
                      size="14"
                      class="mr-1"
                      :color="rule.valid ? 'success' : 'grey'"
                    ></v-icon>
                    {{ rule.text }}
                  </div>
                </div>
              </div>

              <!-- Champ Confirmation du mot de passe -->
              <v-text-field
                v-model="confirmPassword"
                label="Confirmer le mot de passe"
                prepend-inner-icon="mdi-lock-check"
                :append-inner-icon="showConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
                :type="showConfirmPassword ? 'text' : 'password'"
                variant="outlined"
                density="comfortable"
                :rules="confirmPasswordRules"
                autocomplete="new-password"
                required
                @click:append-inner="showConfirmPassword = !showConfirmPassword"
              ></v-text-field>
            </template>

            <v-btn
              type="submit"
              color="primary"
              block
              size="large"
              :loading="authLoading"
              class="mt-3 text-none font-weight-bold"
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
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const authTab = ref<"login" | "register">("login");
const formRef = ref<any>(null);
const isFormValid = ref(false);

const loginIdentifier = ref("");
const email = ref("");
const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const generatedNotice = ref(false);

const authError = ref("");
const authLoading = ref(false);

// Règles de validation
const loginIdentifierRules = [
  (v: string) => !!v || "L'identifiant est requis",
];

const emailRules = [
  (v: string) => !!v || "L'adresse email est requise",
  (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Veuillez saisir une adresse email valide (ex: nom@domaine.com)",
];

const usernameRules = [
  (v: string) => !v || v.trim().length >= 2 || "Le nom d'utilisateur doit comporter au moins 2 caractères",
];

const passwordRules = computed(() => {
  if (authTab.value === "login") {
    return [(v: string) => !!v || "Le mot de passe est requis"];
  }
  return [
    (v: string) => !!v || "Le mot de passe est requis",
    (v: string) => (v && v.length >= 6) || "Le mot de passe doit comporter au moins 6 caractères (8 recommandés)",
  ];
});

const confirmPasswordRules = [
  (v: string) => !!v || "Veuillez confirmer votre mot de passe",
  (v: string) => v === password.value || "Les mots de passe ne correspondent pas",
];

// Critères de sécurité du mot de passe
const passwordCriteria = computed(() => [
  { text: "Au moins 6 caractères (8 recommandés)", valid: password.value.length >= 6 },
  { text: "Au moins une lettre majuscule (A-Z)", valid: /[A-Z]/.test(password.value) },
  { text: "Au moins une lettre minuscule (a-z)", valid: /[a-z]/.test(password.value) },
  { text: "Au moins un chiffre (0-9)", valid: /[0-9]/.test(password.value) },
  { text: "Au moins un caractère spécial (!@#$%^&*...)", valid: /[^A-Za-z0-9]/.test(password.value) },
]);

// Calcul de la robustesse globale
const passwordStrength = computed(() => {
  const p = password.value;
  if (!p) return { score: 0, label: "Non renseigné", color: "grey" };

  let score = 0;
  if (p.length >= 6) score++;
  if (p.length >= 8) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;

  if (score <= 1) return { score: 1, label: "Très faible", color: "error" };
  if (score === 2) return { score: 2, label: "Faible", color: "warning" };
  if (score === 3) return { score: 3, label: "Moyen", color: "info" };
  if (score === 4) return { score: 4, label: "Robuste", color: "success" };
  return { score: 4, label: "Très robuste", color: "success" };
});

function onTabChange() {
  authError.value = "";
  generatedNotice.value = false;
  password.value = "";
  confirmPassword.value = "";
  showPassword.value = false;
  showConfirmPassword.value = false;
}

/**
 * Génère un mot de passe cryptographiquement robuste et remplit les champs.
 */
function generateStrongPassword() {
  const length = 16;
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghjkmnpqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%^&*()-_=+[]{}";
  const all = uppercase + lowercase + numbers + symbols;

  const cryptoObj = window.crypto || (window as any).msCrypto;
  const randomBytes = new Uint32Array(length);
  cryptoObj.getRandomValues(randomBytes);

  let generated = [
    uppercase[randomBytes[0] % uppercase.length],
    lowercase[randomBytes[1] % lowercase.length],
    numbers[randomBytes[2] % numbers.length],
    symbols[randomBytes[3] % symbols.length],
  ];

  for (let i = 4; i < length; i++) {
    generated.push(all[randomBytes[i] % all.length]);
  }

  // Mélange aléatoire de Fisher-Yates
  for (let i = generated.length - 1; i > 0; i--) {
    const j = randomBytes[i] % (i + 1);
    const temp = generated[i];
    generated[i] = generated[j];
    generated[j] = temp;
  }

  const strongPass = generated.join("");
  password.value = strongPass;
  confirmPassword.value = strongPass;
  showPassword.value = true;
  showConfirmPassword.value = true;
  generatedNotice.value = true;
}

async function handleAuthSubmit() {
  authError.value = "";

  if (formRef.value) {
    const { valid } = await formRef.value.validate();
    if (!valid) {
      return;
    }
  }

  if (authTab.value === "register" && password.value !== confirmPassword.value) {
    authError.value = "Les mots de passe saisis ne correspondent pas.";
    return;
  }

  authLoading.value = true;
  try {
    if (authTab.value === "login") {
      await authStore.login(loginIdentifier.value, password.value);
    } else {
      await authStore.register(email.value, password.value, undefined, username.value || undefined);
    }
    await chatStore.loadConversations();
    router.push("/chat");
  } catch (err: any) {
    const details = err.response?.data?.details;
    if (Array.isArray(details) && details.length > 0) {
      authError.value = details.map((d: any) => d.message).join(" • ");
    } else {
      authError.value = err.response?.data?.error || err.message || "Erreur d'authentification";
    }
  } finally {
    authLoading.value = false;
  }
}
</script>
