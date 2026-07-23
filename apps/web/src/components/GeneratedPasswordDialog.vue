<template>
  <v-dialog :model-value="modelValue" max-width="480" persistent @update:model-value="emit('update:modelValue', $event)">
    <v-card class="pa-4 rounded-lg">
      <v-card-title class="font-weight-bold d-flex align-center">
        <v-icon icon="mdi-key-variant" color="success" class="mr-2"></v-icon>
        Mot de passe réinitialisé
      </v-card-title>
      <v-card-text>
        <v-alert type="info" variant="tonal" class="mb-4" density="compact">
          Transmettez ce mot de passe à l'utilisateur par un canal externe sécurisé. Il ne sera plus affiché après fermeture.
        </v-alert>
        <v-text-field
          :model-value="password"
          label="Nouveau mot de passe"
          variant="outlined"
          readonly
          append-inner-icon="mdi-content-copy"
          @click:append-inner="copyPassword"
        ></v-text-field>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="flat" @click="close">Fermer</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  password: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
}>();

function copyPassword() {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(props.password);
  }
}

function close() {
  emit("update:modelValue", false);
}
</script>
