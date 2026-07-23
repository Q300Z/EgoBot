<template>
  <v-dialog :model-value="modelValue" max-width="850" @update:model-value="emit('update:modelValue', $event)">
    <v-card class="rounded-lg pa-4">
      <v-card-title class="d-flex align-center justify-space-between mb-4 pa-0">
        <div class="d-flex align-center">
          <v-icon icon="mdi-forum" color="primary" class="mr-2"></v-icon>
          <div>
            <div class="text-h6 font-weight-bold">
              Conversations de {{ user?.email || 'Utilisateur' }}
            </div>
            <div class="text-caption text-disabled" v-if="user?.id">
              ID : {{ user.id }}
            </div>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close"></v-btn>
      </v-card-title>

      <v-card-text class="pa-0">
        <v-table hover class="rounded-lg border">
          <thead>
            <tr>
              <th class="text-left">Titre / ID</th>
              <th class="text-left">Modèle</th>
              <th class="text-left">Messages</th>
              <th class="text-left">Dernière mise à jour</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in conversations" :key="c.id">
              <td>
                <div class="font-weight-bold text-body-2">{{ c.title || 'Sans titre' }}</div>
                <div class="font-weight-mono text-caption text-disabled">{{ c.id }}</div>
              </td>
              <td>
                <v-chip size="x-small" variant="outlined">{{ c.model || 'CHATBOT' }}</v-chip>
              </td>
              <td>
                <v-chip size="x-small" color="secondary">{{ c._count?.messages || c.messages?.length || 0 }} msgs</v-chip>
              </td>
              <td class="text-caption">{{ new Date(c.updated_at).toLocaleString() }}</td>
              <td class="text-right">
                <v-btn
                  color="primary"
                  size="small"
                  variant="tonal"
                  prepend-icon="mdi-eye"
                  class="text-none"
                  @click="emit('inspect', c.id)"
                >
                  Inspecter / Live
                </v-btn>
              </td>
            </tr>
            <tr v-if="conversations.length === 0">
              <td colspan="5" class="text-center text-disabled pa-4">
                Aucune conversation pour cet utilisateur
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>

      <v-card-actions class="justify-end pa-0 mt-4">
        <v-btn color="primary" variant="flat" class="text-none" @click="close">Fermer</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  user: { id: string; email: string } | null;
  conversations: any[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "inspect", conversationId: string): void;
}>();

function close() {
  emit("update:modelValue", false);
}
</script>

<style scoped>
.font-weight-mono {
  font-family: monospace;
}
</style>
