<template>
  <div>
    <!-- Bandeau / Toast Snackbar Flottant -->
    <v-snackbar
      v-model="notificationStore.isVisible"
      :color="snackbarColor"
      location="top"
      :timeout="notificationStore.type === 'error' ? 8000 : 5000"
      elevation="8"
      rounded="lg"
      class="mt-2"
    >
      <div class="d-flex align-start">
        <v-icon :icon="iconName" size="24" class="mr-3 mt-1"></v-icon>
        <div class="flex-grow-1 mr-2">
          <div class="font-weight-bold text-subtitle-2">
            {{ notificationStore.title }}
          </div>
          <div class="text-caption mt-0 text-white-opacity">
            {{ notificationStore.message }}
          </div>
        </div>

        <div class="d-flex align-center gap-1">
          <!-- Bouton pour voir l'explication complète si disponible -->
          <v-btn
            v-if="hasExtendedExplanation"
            variant="tonal"
            size="x-small"
            color="white"
            class="text-caption font-weight-bold mr-1"
            @click="notificationStore.openDetails"
          >
            Pourquoi ?
          </v-btn>

          <!-- Bouton d'action spécifique (ex: Reconnexion / Réessayer) -->
          <v-btn
            v-if="notificationStore.actionText"
            variant="elevated"
            size="x-small"
            color="white"
            class="text-caption font-weight-bold text-black mr-1"
            @click="notificationStore.triggerAction"
          >
            {{ notificationStore.actionText }}
          </v-btn>

          <v-btn
            icon="mdi-close"
            variant="text"
            size="x-small"
            color="white"
            aria-label="Fermer la notification"
            @click="notificationStore.close"
          ></v-btn>
        </div>
      </div>
    </v-snackbar>

    <!-- Modale d'explication pédagogique détaillée -->
    <v-dialog v-model="notificationStore.isDetailsOpen" max-width="560">
      <v-card class="rounded-lg pa-2">
        <v-card-item class="pb-2">
          <template #prepend>
            <v-avatar :color="snackbarColor" size="40">
              <v-icon :icon="iconName" color="white"></v-icon>
            </v-avatar>
          </template>
          <v-card-title class="text-h6 font-weight-bold">
            {{ notificationStore.title }}
          </v-card-title>
          <v-card-subtitle>
            {{ notificationStore.message }}
          </v-card-subtitle>
        </v-card-item>

        <v-divider class="my-2"></v-divider>

        <v-card-text class="pt-2 pb-2">
          <div class="mb-3">
            <div class="text-subtitle-2 font-weight-bold mb-1">
              Explication de l'incident :
            </div>
            <p class="text-body-2 text-medium-emphasis">
              {{ notificationStore.explanation }}
            </p>
          </div>

          <!-- Liste des champs en anomalie (ex: Erreur de validation Zod) -->
          <div v-if="notificationStore.details.length > 0" class="mb-3">
            <div class="text-subtitle-2 font-weight-bold mb-1 text-error">
              Éléments à corriger :
            </div>
            <v-list density="compact" class="bg-surface-variant rounded-lg pa-1">
              <v-list-item
                v-for="(detail, index) in notificationStore.details"
                :key="index"
                class="py-1"
              >
                <template #prepend>
                  <v-icon icon="mdi-alert-circle-outline" color="error" size="small"></v-icon>
                </template>
                <v-list-item-title class="text-caption font-weight-bold">
                  {{ detail.field ? `Champ [${detail.field}] :` : '' }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption text-wrap">
                  {{ detail.message }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </div>

          <!-- Section technique repliable pour le diagnostic -->
          <v-expansion-panels v-if="notificationStore.rawError" variant="inset" class="mt-2">
            <v-expansion-panel title="Détails techniques (Développeur)" elevation="0">
              <v-expansion-panel-text>
                <pre class="technical-details">{{ formattedRawError }}</pre>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>

        <v-card-actions class="px-4 pb-3">
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            color="grey-darken-1"
            class="text-none"
            @click="notificationStore.closeDetails"
          >
            Fermer
          </v-btn>
          <v-btn
            v-if="notificationStore.actionText"
            color="primary"
            variant="elevated"
            class="text-none font-weight-bold"
            @click="onDialogAction"
          >
            {{ notificationStore.actionText }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useNotificationStore } from "../stores/notification";

const notificationStore = useNotificationStore();

const snackbarColor = computed(() => {
  switch (notificationStore.type) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "info":
    default:
      return "primary";
  }
});

const iconName = computed(() => {
  switch (notificationStore.type) {
    case "error":
      return "mdi-alert-circle";
    case "warning":
      return "mdi-alert";
    case "success":
      return "mdi-check-circle";
    case "info":
    default:
      return "mdi-information";
  }
});

const hasExtendedExplanation = computed(() => {
  return (
    (notificationStore.explanation && notificationStore.explanation !== notificationStore.message) ||
    notificationStore.details.length > 0 ||
    !!notificationStore.rawError
  );
});

const formattedRawError = computed(() => {
  try {
    const raw: any = notificationStore.rawError;
    if (!raw) return "";
    const cleanObj = {
      message: raw.message,
      name: raw.name,
      code: raw.code,
      status: raw.response?.status,
      statusText: raw.response?.statusText,
      responseData: raw.response?.data,
    };
    return JSON.stringify(cleanObj, null, 2);
  } catch {
    return String(notificationStore.rawError);
  }
});

function onDialogAction() {
  notificationStore.closeDetails();
  notificationStore.triggerAction();
}
</script>

<style scoped>
.technical-details {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  color: rgb(var(--v-theme-on-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
  max-height: 180px;
}
.text-white-opacity {
  color: rgba(255, 255, 255, 0.9);
}
</style>
