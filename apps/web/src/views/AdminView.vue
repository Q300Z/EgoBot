<template>
  <div class="fill-height w-100 pa-0">
    <v-row class="fill-height ma-0 pa-4">
      <v-col cols="12">
        <v-card class="pa-4 rounded-lg border">
          <v-card-title class="d-flex align-center justify-space-between mb-4">
            <div class="d-flex align-center">
              <v-icon icon="mdi-shield-account" color="warning" class="mr-2"></v-icon>
              <span class="text-h5 font-weight-bold">Backoffice Administration</span>
            </div>
            <div class="d-flex align-center">
              <v-btn
                color="primary"
                prepend-icon="mdi-account-plus"
                class="mr-2 text-none"
                @click="showCreateUserDialog = true"
              >
                Créer un Utilisateur
              </v-btn>
              <v-btn
                color="primary"
                variant="outlined"
                prepend-icon="mdi-refresh"
                class="text-none"
                @click="backofficeStore.loadUsers()"
              >
                Rafraîchir
              </v-btn>
            </div>
          </v-card-title>

          <!-- Tableau des Utilisateurs -->
          <v-table hover class="rounded-lg border">
            <thead>
              <tr>
                <th class="text-left">ID</th>
                <th class="text-left">Email</th>
                <th class="text-left">Rôle</th>
                <th class="text-left">Créé le</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in backofficeStore.users" :key="u.id">
                <td class="font-weight-mono text-caption">{{ u.id }}</td>
                <td class="font-weight-medium">{{ u.email }}</td>
                <td>
                  <v-chip
                    size="small"
                    :color="u.role === 'ADMIN' ? 'warning' : 'info'"
                    class="font-weight-bold text-white"
                  >
                    {{ u.role }}
                  </v-chip>
                </td>
                <td class="text-caption">{{ new Date(u.created_at).toLocaleString() }}</td>
                <td class="text-right">
                  <v-btn
                    color="info"
                    variant="tonal"
                    size="small"
                    prepend-icon="mdi-chat-processing-outline"
                    class="mr-1 text-none"
                    title="Voir les conversations"
                    @click="openUserConversationsModal(u)"
                  >
                    Conversations
                  </v-btn>
                  <v-btn icon="mdi-pencil" color="primary" variant="text" size="small" class="mr-1" title="Modifier l'utilisateur" aria-label="Modifier l'utilisateur" @click="openEditUserDialog(u)"></v-btn>
                  <v-btn icon="mdi-delete" color="error" variant="text" size="small" title="Supprimer l'utilisateur" aria-label="Supprimer l'utilisateur" @click="handleDeleteUser(u.id)"></v-btn>
                </td>
              </tr>
              <tr v-if="backofficeStore.users.length === 0">
                <td colspan="5" class="text-center text-disabled pa-4">
                  Aucun utilisateur enregistré
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
    </v-row>

    <!-- Dialog Création Utilisateur -->
    <v-dialog v-model="showCreateUserDialog" max-width="500">
      <v-card class="pa-4 rounded-lg">
        <v-card-title class="text-h6 font-weight-bold mb-2">Créer un nouvel utilisateur</v-card-title>
        <v-card-text>
          <v-text-field v-model="newUserEmail" label="Adresse Email" type="email" variant="outlined" density="comfortable"></v-text-field>
          <v-text-field v-model="newUserPassword" label="Mot de passe" type="password" variant="outlined" density="comfortable"></v-text-field>
          <v-select v-model="newUserRole" :items="['USER', 'ADMIN']" label="Rôle" variant="outlined" density="comfortable"></v-select>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn color="grey" variant="text" @click="showCreateUserDialog = false">Annuler</v-btn>
          <v-btn color="primary" variant="flat" @click="handleCreateUser">Créer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <EditUserDialog
      v-model="showEditUserDialog"
      :user="selectedEditUser"
      :loading="editUserLoading"
      @save="handleEditUser"
    />

    <GeneratedPasswordDialog
      v-model="showGeneratedPasswordDialog"
      :password="generatedPassword"
    />

    <UserConversationsDialog
      v-model="showUserConversationsDialog"
      :user="selectedUserForConversations"
      :conversations="backofficeStore.userConversations"
      @inspect="openLiveConversationModal"
    />

    <LiveInspectionModal
      v-model="showLiveConversationDialog"
      :conversation="inspectConversation"
      :is-streaming="isLiveStreaming"
      @close="closeLiveConversationModal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useBackofficeStore } from "../stores/backoffice";
import { useAuthStore } from "../stores/auth";
import EditUserDialog from "../components/EditUserDialog.vue";
import GeneratedPasswordDialog from "../components/GeneratedPasswordDialog.vue";
import UserConversationsDialog from "../components/UserConversationsDialog.vue";
import LiveInspectionModal from "../components/LiveInspectionModal.vue";

const route = useRoute();
const router = useRouter();
const backofficeStore = useBackofficeStore();
const authStore = useAuthStore();

const showCreateUserDialog = ref(false);
const newUserEmail = ref("");
const newUserPassword = ref("");
const newUserRole = ref<"USER" | "ADMIN">("USER");

const showUserConversationsDialog = ref(false);
const selectedUserForConversations = ref<any>(null);

const showLiveConversationDialog = ref(false);
const inspectConversation = ref<any>(null);
const isLiveStreaming = ref(false);
const inspectStreamCleanup = ref<(() => void) | null>(null);

const showEditUserDialog = ref(false);
const selectedEditUser = ref<any>(null);
const editUserLoading = ref(false);

const showGeneratedPasswordDialog = ref(false);
const generatedPassword = ref("");

async function handleCreateUser() {
  if (!newUserEmail.value || !newUserPassword.value) return;
  await backofficeStore.createUser({
    email: newUserEmail.value,
    password: newUserPassword.value,
    role: newUserRole.value,
  });
  newUserEmail.value = "";
  newUserPassword.value = "";
  showCreateUserDialog.value = false;
}

function openEditUserDialog(user: any) {
  selectedEditUser.value = user;
  showEditUserDialog.value = true;
}

async function handleEditUser(data: { email?: string; role?: string; resetPassword?: boolean }) {
  if (!selectedEditUser.value) return;
  editUserLoading.value = true;
  try {
    const res = await backofficeStore.updateUser(selectedEditUser.value.id, data);
    showEditUserDialog.value = false;
    if (res?.generatedPassword) {
      generatedPassword.value = res.generatedPassword;
      showGeneratedPasswordDialog.value = true;
    }
  } finally {
    editUserLoading.value = false;
  }
}

async function handleDeleteUser(id: string) {
  await backofficeStore.deleteUser(id);
}

async function openUserConversationsModal(user: any) {
  selectedUserForConversations.value = user;
  await backofficeStore.loadUserConversations(user.id);
  showUserConversationsDialog.value = true;
  if (router && route?.path !== `/admin/users/${user.id}/conversations`) {
    router.push(`/admin/users/${user.id}/conversations`);
  }
}

async function openLiveConversationModal(id: string) {
  if (router && route?.path !== `/admin/conversations/${id}`) {
    router.push(`/admin/conversations/${id}`);
  }
  await startInspectStream(id);
}

async function startInspectStream(id: string) {
  if (inspectStreamCleanup.value) {
    inspectStreamCleanup.value();
    inspectStreamCleanup.value = null;
  }

  inspectConversation.value = await backofficeStore.getAdminConversation(id);
  showLiveConversationDialog.value = true;
  isLiveStreaming.value = false;

  let activeStreamingJobId: string | null = null;

  const cleanup = authStore.sdk.connectAdminConversationStream(id, {
    onToken: async (chunk: string, jobId?: string) => {
      isLiveStreaming.value = true;
      if (!inspectConversation.value) return;

      const msgs = inspectConversation.value.messages;
      const lastMsg = msgs[msgs.length - 1];

      if (jobId && activeStreamingJobId !== jobId) {
        activeStreamingJobId = jobId;
        const refreshed = await backofficeStore.getAdminConversation(id);
        if (refreshed && refreshed.messages) {
          inspectConversation.value = refreshed;
        }
        inspectConversation.value.messages.push({
          role: "ASSISTANT",
          content: chunk,
          _jobId: jobId,
        });
      } else if (lastMsg && lastMsg.role === "ASSISTANT" && (!jobId || lastMsg._jobId === jobId)) {
        lastMsg.content += chunk;
      } else {
        msgs.push({ role: "ASSISTANT", content: chunk, _jobId: jobId });
      }
    },
    onStatus: async (status: string) => {
      if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
        isLiveStreaming.value = false;
        activeStreamingJobId = null;
        const updated = await backofficeStore.getAdminConversation(id);
        if (updated && inspectConversation.value) {
          inspectConversation.value = updated;
        }
      }
    },
    onError: () => {
      isLiveStreaming.value = false;
      activeStreamingJobId = null;
    },
  });

  inspectStreamCleanup.value = cleanup;
}

function closeLiveConversationModal() {
  if (inspectStreamCleanup.value) {
    inspectStreamCleanup.value();
    inspectStreamCleanup.value = null;
  }
  showLiveConversationDialog.value = false;
  inspectConversation.value = null;
  isLiveStreaming.value = false;
  if (selectedUserForConversations.value) {
    router.push(`/admin/users/${selectedUserForConversations.value.id}/conversations`);
  } else {
    router.push("/admin");
  }
}

watch(
  () => route?.params?.userId,
  async (newUserId) => {
    if (newUserId && typeof newUserId === "string") {
      const u = backofficeStore.users.find((user) => user.id === newUserId);
      selectedUserForConversations.value = u || { id: newUserId, email: "Utilisateur" };
      await backofficeStore.loadUserConversations(newUserId);
      showUserConversationsDialog.value = true;
    }
  },
  { immediate: true }
);

watch(
  () => route?.params?.id,
  async (convId) => {
    if (convId && typeof convId === "string" && route?.path?.startsWith("/admin/conversations")) {
      await startInspectStream(convId);
    }
  },
  { immediate: true }
);

onMounted(async () => {
  if (backofficeStore.users.length === 0) {
    await backofficeStore.loadUsers();
  }
});
</script>

<style scoped>
.font-weight-mono {
  font-family: monospace;
}
</style>
