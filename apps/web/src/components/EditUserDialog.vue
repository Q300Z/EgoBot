<template>
  <v-dialog :model-value="modelValue" max-width="500" @update:model-value="emit('update:modelValue', $event)">
    <v-card class="pa-4 rounded-lg">
      <v-card-title class="font-weight-bold d-flex align-center">
        <v-icon icon="mdi-account-edit" color="primary" class="mr-2"></v-icon>
        Modifier l'utilisateur
      </v-card-title>
      <v-card-text>
        <v-text-field v-model="form.email" label="Email" variant="outlined" density="comfortable" class="mb-2"></v-text-field>
        <v-select v-model="form.role" :items="['USER', 'ADMIN']" label="Rôle" variant="outlined" density="comfortable" class="mb-2"></v-select>
        <v-switch
          v-model="form.resetPassword"
          label="Réinitialiser le mot de passe"
          color="warning"
          inset
          hide-details
        ></v-switch>
        <v-alert v-if="form.resetPassword" type="warning" variant="tonal" class="mt-3" density="compact">
          Un nouveau mot de passe aléatoire sera généré et devra être transmis à l'utilisateur.
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="close">Annuler</v-btn>
        <v-btn color="primary" variant="flat" :loading="loading" @click="save">Enregistrer</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  modelValue: boolean;
  user: { id: string; email: string; role: string } | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "save", data: { id: string; email: string; role: string; resetPassword: boolean }): void;
}>();

const form = ref({
  email: "",
  role: "USER",
  resetPassword: false,
});

watch(
  () => props.user,
  (newUser) => {
    if (newUser) {
      form.value.email = newUser.email;
      form.value.role = newUser.role;
      form.value.resetPassword = false;
    }
  },
  { immediate: true }
);

function close() {
  emit("update:modelValue", false);
}

function save() {
  if (props.user?.id) {
    emit("save", {
      id: props.user.id,
      email: form.value.email,
      role: form.value.role,
      resetPassword: form.value.resetPassword,
    });
  }
}
</script>
