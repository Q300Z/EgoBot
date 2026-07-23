<template>
  <v-app>
    <!-- BARRE DE NAVIGATION SUPÉRIEURE (Si connecté) -->
    <v-app-bar v-if="authStore.token" color="surface" elevation="2">
      <v-app-bar-title class="font-weight-bold d-flex align-center">
        <v-icon icon="mdi-robot" color="primary" class="mr-2"></v-icon>
        Scaffold LLM Monorepo
      </v-app-bar-title>

      <v-spacer></v-spacer>

      <!-- Info Utilisateur -->
      <v-chip color="primary" variant="tonal" class="mr-2">
        <v-icon start icon="mdi-account"></v-icon>
        {{ authStore.user?.email || 'Utilisateur' }}
      </v-chip>
      <v-chip :color="authStore.user?.role === 'ADMIN' ? 'warning' : 'info'" variant="flat" size="small" class="mr-4">
        {{ authStore.user?.role }}
      </v-chip>

      <!-- Actions de Navigation -->
      <v-btn
        variant="text"
        :color="currentView === 'chat' ? 'primary' : undefined"
        prepend-icon="mdi-chat"
        @click="currentView = 'chat'"
      >
        Chat
      </v-btn>

      <v-btn
        v-if="authStore.user?.role === 'ADMIN'"
        variant="text"
        :color="currentView === 'admin' ? 'warning' : undefined"
        prepend-icon="mdi-shield-account"
        @click="currentView = 'admin'; backofficeStore.loadUsers(); backofficeStore.loadAdminConversations()"
      >
        Backoffice
      </v-btn>

      <v-btn
        v-if="authStore.user?.role === 'ADMIN'"
        variant="text"
        :color="currentView === 'debug' ? 'accent' : undefined"
        prepend-icon="mdi-bug-outline"
        @click="currentView = 'debug'; startEventBusDebugStream()"
      >
        EventBus Live
      </v-btn>

      <!-- Sélecteur de Thème (Système / Clair / Sombre) -->
      <v-menu location="bottom end">
        <template #activator="{ props }">
          <v-btn icon v-bind="props" class="mr-1" title="Changer le thème">
            <v-icon :icon="themeModeIcon"></v-icon>
          </v-btn>
        </template>
        <v-list density="compact" nav class="rounded-lg border">
          <v-list-item
            value="system"
            :active="themeMode === 'system'"
            prepend-icon="mdi-monitor"
            title="Système (Automatique)"
            @click="setThemeMode('system')"
          ></v-list-item>
          <v-list-item
            value="light"
            :active="themeMode === 'light'"
            prepend-icon="mdi-weather-sunny"
            title="Clair"
            @click="setThemeMode('light')"
          ></v-list-item>
          <v-list-item
            value="dark"
            :active="themeMode === 'dark'"
            prepend-icon="mdi-weather-night"
            title="Sombre"
            @click="setThemeMode('dark')"
          ></v-list-item>
        </v-list>
      </v-menu>

      <v-btn color="error" variant="outlined" prepend-icon="mdi-logout" class="ml-2" @click="handleLogout">
        Déconnexion
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid class="fill-height pa-4">
        <!-- VUE AUTHENTIFICATION (Si non connecté) -->
        <v-row v-if="!authStore.token" justify="center" align="center" class="fill-height">
          <v-col cols="12" sm="8" md="5" lg="4">
            <v-card elevation="8" class="pa-4 rounded-lg border">
              <v-card-item class="text-center">
                <v-avatar color="primary" size="64" class="mb-2">
                  <v-icon icon="mdi-robot" size="36"></v-icon>
                </v-avatar>
                <v-card-title class="text-h5 font-weight-bold">Scaffold LLM</v-card-title>
                <v-card-subtitle>Monorepo 100% TypeScript & Vuetify 3</v-card-subtitle>
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

                  <v-select
                    v-if="authTab === 'register'"
                    v-model="role"
                    :items="['USER', 'ADMIN']"
                    label="Rôle initial"
                    prepend-inner-icon="mdi-account-badge"
                    variant="outlined"
                    density="comfortable"
                  ></v-select>

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

        <!-- VUE PRINCIPALE CHAT -->
        <v-row v-else-if="currentView === 'chat'" class="fill-height ma-0" no-gutters>
          <!-- Sidebar Historique Conversations -->
          <v-col cols="12" md="3" lg="2" class="pr-md-2 mb-4 mb-md-0">
            <v-card height="100%" class="d-flex flex-column rounded-lg border">
              <v-card-title class="d-flex align-center justify-space-between pa-3">
                <span class="text-subtitle-1 font-weight-bold">Conversations</span>
                <v-btn icon="mdi-plus" color="primary" size="small" variant="flat" title="Nouvelle Conversation" @click="chatStore.currentConversation = null"></v-btn>
              </v-card-title>
              <v-divider></v-divider>
              <v-list density="compact" nav class="flex-grow-1 overflow-y-auto pa-2">
                <v-list-item
                  v-for="c in chatStore.conversations"
                  :key="c.id"
                  :active="chatStore.currentConversation?.id === c.id"
                  color="primary"
                  rounded="lg"
                  class="mb-1"
                  @click="chatStore.loadConversation(c.id)"
                >
                  <template #prepend>
                    <v-icon icon="mdi-message-text-outline" size="small"></v-icon>
                  </template>
                  <v-list-item-title class="text-caption font-weight-medium">
                    {{ c.title || 'Sans titre' }}
                  </v-list-item-title>
                  <template #append>
                    <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" @click.stop="handleDeleteConversation(c.id)"></v-btn>
                  </template>
                </v-list-item>
                <div v-if="chatStore.conversations.length === 0" class="text-center text-caption text-disabled pa-4">
                  Aucune conversation
                </div>
              </v-list>
            </v-card>
          </v-col>

          <!-- Zone de Chat Principale -->
          <v-col cols="12" md="9" lg="10" class="pl-md-2">
            <v-card height="100%" class="d-flex flex-column rounded-lg border">
              <!-- En-tête Chat -->
              <v-card-title class="d-flex align-center justify-space-between border-b pa-3">
                <div class="d-flex align-center">
                  <v-icon icon="mdi-chat-processing" color="primary" class="mr-2"></v-icon>
                  <span class="text-h6 font-weight-bold">
                    {{ chatStore.currentConversation?.title || 'Nouvelle Discussion' }}
                  </span>
                </div>
                <v-chip v-if="chatStore.isStreaming" color="warning" size="small" prepend-icon="mdi-loading mdi-spin">
                  Génération en cours...
                </v-chip>
              </v-card-title>

              <!-- Flux de Messages -->
              <v-card-text ref="chatBoxRef" class="flex-grow-1 overflow-y-auto pa-4">
                <div v-if="!chatStore.currentConversation?.messages?.length" class="d-flex flex-column align-center justify-center fill-height text-disabled">
                  <v-icon icon="mdi-robot-excited-outline" size="64" class="mb-2" color="primary"></v-icon>
                  <div class="text-h6">Posez votre question à l'IA</div>
                  <div class="text-caption">Scaffold Monorepo 100% TypeScript + Valkey 8</div>
                </div>

                <div
                  v-for="(msg, idx) in chatStore.currentConversation?.messages || []"
                  :key="idx"
                  :class="['d-flex mb-4', msg.role === 'USER' ? 'justify-end' : 'justify-start']"
                >
                  <div :class="['d-flex align-start max-w-75', msg.role === 'USER' ? 'flex-row-reverse' : 'flex-row']">
                    <v-avatar size="32" :color="msg.role === 'USER' ? 'primary' : 'secondary'" class="mx-2">
                      <v-icon :icon="msg.role === 'USER' ? 'mdi-account' : 'mdi-robot'" size="18"></v-icon>
                    </v-avatar>
                    <v-card
                      :color="msg.role === 'USER' ? 'primary' : 'surface-variant'"
                      variant="flat"
                      class="pa-3 rounded-lg"
                      elevation="1"
                    >
                      <div class="text-caption text-medium-emphasis mb-1 font-weight-bold">
                        {{ msg.role === 'USER' ? 'Vous' : 'Assistant IA' }}
                      </div>
                      <div v-if="msg.role === 'USER'" class="text-body-2 white-space-pre-wrap">{{ msg.content }}</div>
                      <div v-else class="text-body-2 markdown-body" v-html="renderMarkdown(msg.content || '...')"></div>
                    </v-card>
                  </div>
                </div>
              </v-card-text>

              <!-- Zone de Saisie -->
              <v-divider></v-divider>
              <v-card-actions class="pa-3">
                <v-text-field
                  v-model="promptInput"
                  placeholder="Écrivez un message..."
                  variant="outlined"
                  density="comfortable"
                  hide-details
                  :disabled="chatStore.isStreaming"
                  @keyup.enter="handleSend"
                >
                  <template #append-inner>
                    <v-btn
                      icon="mdi-send"
                      color="primary"
                      variant="flat"
                      size="small"
                      :loading="chatStore.isStreaming"
                      :disabled="!promptInput.trim()"
                      @click="handleSend"
                    ></v-btn>
                  </template>
                </v-text-field>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>

        <!-- VUE BACKOFFICE ADMIN -->
        <v-row v-else-if="currentView === 'admin'" class="fill-height ma-0">
          <v-col cols="12">
            <v-card class="pa-4 rounded-lg border">
              <v-card-title class="d-flex align-center justify-space-between mb-4">
                <div class="d-flex align-center">
                  <v-icon icon="mdi-shield-account" color="warning" class="mr-2"></v-icon>
                  <span class="text-h5 font-weight-bold">Backoffice Administration</span>
                </div>
                <div class="d-flex align-center">
                  <v-btn
                    v-if="adminTab === 'users'"
                    color="primary"
                    prepend-icon="mdi-account-plus"
                    @click="showCreateUserDialog = true"
                  >
                    Créer un Utilisateur
                  </v-btn>
                  <v-btn
                    v-if="adminTab === 'conversations'"
                    color="primary"
                    variant="outlined"
                    prepend-icon="mdi-refresh"
                    @click="backofficeStore.loadAdminConversations()"
                  >
                    Rafraîchir
                  </v-btn>
                </div>
              </v-card-title>

              <v-tabs v-model="adminTab" color="primary" class="mb-4">
                <v-tab value="users" prepend-icon="mdi-account-group">Utilisateurs ({{ backofficeStore.users.length }})</v-tab>
                <v-tab value="conversations" prepend-icon="mdi-chat-bullet-points">Conversations & Live SSE ({{ backofficeStore.adminConversations.length }})</v-tab>
              </v-tabs>

              <v-card-text>
                <v-window v-model="adminTab">
                  <!-- TAB UTILISATEURS -->
                  <v-window-item value="users">
                    <v-table hover class="rounded-lg border">
                      <thead>
                        <tr>
                          <th class="text-left">ID</th>
                          <th class="text-left">Email</th>
                          <th class="text-left">Rôle</th>
                          <th class="text-left">Date de création</th>
                          <th class="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="u in backofficeStore.users" :key="u.id">
                          <td class="font-weight-mono text-caption">{{ u.id }}</td>
                          <td>{{ u.email }}</td>
                          <td>
                            <v-chip :color="u.role === 'ADMIN' ? 'warning' : 'info'" size="x-small" variant="flat">
                              {{ u.role }}
                            </v-chip>
                          </td>
                          <td class="text-caption">{{ new Date(u.created_at).toLocaleString() }}</td>
                          <td class="text-right">
                            <v-btn icon="mdi-pencil" color="primary" variant="text" size="small" class="mr-1" @click="openEditUserDialog(u)"></v-btn>
                            <v-btn icon="mdi-delete" color="error" variant="text" size="small" @click="handleDeleteUser(u.id)"></v-btn>
                          </td>
                        </tr>
                      </tbody>
                    </v-table>
                  </v-window-item>

                  <!-- TAB CONVERSATIONS -->
                  <v-window-item value="conversations">
                    <v-table hover class="rounded-lg border">
                      <thead>
                        <tr>
                          <th class="text-left">Titre / ID</th>
                          <th class="text-left">Utilisateur</th>
                          <th class="text-left">Modèle</th>
                          <th class="text-left">Messages</th>
                          <th class="text-left">Dernière mise à jour</th>
                          <th class="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="c in backofficeStore.adminConversations" :key="c.id">
                          <td>
                            <div class="font-weight-bold text-body-2">{{ c.title || 'Sans titre' }}</div>
                            <div class="font-weight-mono text-caption text-disabled">{{ c.id }}</div>
                          </td>
                          <td>
                            <v-chip size="small" color="primary" variant="tonal" prepend-icon="mdi-account">
                              {{ c.user?.email || 'Inconnu' }}
                            </v-chip>
                          </td>
                          <td>
                            <v-chip size="x-small" variant="outlined">{{ c.model || 'CHATBOT' }}</v-chip>
                          </td>
                          <td>
                            <v-chip size="x-small" color="secondary">{{ c._count?.messages || 0 }} msgs</v-chip>
                          </td>
                          <td class="text-caption">{{ new Date(c.updated_at).toLocaleString() }}</td>
                          <td class="text-right">
                            <v-btn
                              color="primary"
                              size="small"
                              variant="tonal"
                              prepend-icon="mdi-eye"
                              @click="openLiveConversationModal(c.id)"
                            >
                              Inspecter / Live
                            </v-btn>
                          </td>
                        </tr>
                        <tr v-if="backofficeStore.adminConversations.length === 0">
                          <td colspan="6" class="text-center text-disabled pa-4">
                            Aucune conversation utilisateur enregistrée
                          </td>
                        </tr>
                      </tbody>
                    </v-table>
                  </v-window-item>
                </v-window>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- VUE EVENTBUS LIVE DEBUG -->
        <v-row v-else-if="currentView === 'debug'" class="fill-height ma-0">
          <v-col cols="12">
            <v-card class="d-flex flex-column fill-height rounded-lg border bg-grey-darken-4">
              <v-card-title class="d-flex align-center justify-space-between border-b pa-3">
                <div class="d-flex align-center">
                  <v-icon icon="mdi-console" color="accent" class="mr-2"></v-icon>
                  <span class="text-h6 font-weight-bold text-accent">Live EventBus Monitor (SSE)</span>
                </div>
                <v-btn color="error" variant="text" size="small" prepend-icon="mdi-trash-can" @click="debugLogs = []">
                  Effacer
                </v-btn>
              </v-card-title>
              <v-card-text class="flex-grow-1 overflow-y-auto pa-4 font-weight-mono text-caption">
                <div v-for="(log, i) in debugLogs" :key="i" class="mb-2 pb-2 border-b border-grey-darken-3">
                  <span class="text-accent">[{{ log.timestamp }}]</span>
                  <span class="text-warning font-weight-bold mx-2">TOPIC: {{ log.topic }}</span>
                  <span class="text-grey">corrId: {{ log.correlationId }}</span>
                  <pre class="text-green-lighten-2 mt-1">{{ JSON.stringify(log.payload, null, 2) }}</pre>
                </div>
                <div v-if="debugLogs.length === 0" class="text-disabled text-center pa-8">
                  En attente des événements de l'EventBus...
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>

    <!-- DIALOG DE CRÉATION D'UTILISATEUR (ADMIN) -->
    <v-dialog v-model="showCreateUserDialog" max-width="500">
      <v-card class="pa-4 rounded-lg">
        <v-card-title class="font-weight-bold">Créer un Utilisateur</v-card-title>
        <v-card-text>
          <v-text-field v-model="newUserEmail" label="Email" variant="outlined" density="comfortable"></v-text-field>
          <v-text-field v-model="newUserPassword" label="Mot de passe" type="password" variant="outlined" density="comfortable"></v-text-field>
          <v-select v-model="newUserRole" :items="['USER', 'ADMIN']" label="Rôle" variant="outlined" density="comfortable"></v-select>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showCreateUserDialog = false">Annuler</v-btn>
          <v-btn color="primary" variant="flat" @click="handleCreateUser">Créer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG MODIFICATION UTILISATEUR (ADMIN) -->
    <v-dialog v-model="showEditUserDialog" max-width="500">
      <v-card class="pa-4 rounded-lg">
        <v-card-title class="font-weight-bold d-flex align-center">
          <v-icon icon="mdi-account-edit" color="primary" class="mr-2"></v-icon>
          Modifier l'utilisateur
        </v-card-title>
        <v-card-text>
          <v-text-field v-model="editUserEmail" label="Email" variant="outlined" density="comfortable" class="mb-2"></v-text-field>
          <v-select v-model="editUserRole" :items="['USER', 'ADMIN']" label="Rôle" variant="outlined" density="comfortable" class="mb-2"></v-select>
          <v-switch
            v-model="editUserResetPassword"
            label="Réinitialiser le mot de passe"
            color="warning"
            inset
            hide-details
          ></v-switch>
          <v-alert v-if="editUserResetPassword" type="warning" variant="tonal" class="mt-3" density="compact">
            Un nouveau mot de passe aléatoire sera généré et devra être transmis à l'utilisateur.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showEditUserDialog = false">Annuler</v-btn>
          <v-btn color="primary" variant="flat" :loading="editUserLoading" @click="handleEditUser">Enregistrer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG MOT DE PASSE GÉNÉRÉ -->
    <v-dialog v-model="showGeneratedPasswordDialog" max-width="480" persistent>
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
            :model-value="generatedPassword"
            label="Nouveau mot de passe"
            variant="outlined"
            readonly
            append-inner-icon="mdi-content-copy"
            @click:append-inner="() => navigator.clipboard.writeText(generatedPassword)"
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="flat" @click="showGeneratedPasswordDialog = false">Fermer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- DIALOG INSPECTION CONVERSATION & EN DIRECT SSE -->
    <v-dialog v-model="showLiveConversationDialog" max-width="850" persistent>
      <v-card class="d-flex flex-column rounded-lg">
        <v-card-title class="d-flex align-center justify-space-between border-b pa-3">
          <div class="d-flex align-center">
            <v-icon icon="mdi-chat-processing-outline" color="primary" class="mr-2"></v-icon>
            <div>
              <div class="text-h6 font-weight-bold">
                {{ inspectConversation?.title || 'Inspection Conversation' }}
              </div>
              <div class="text-caption text-disabled" v-if="inspectConversation?.user">
                Utilisateur : {{ inspectConversation.user.email }} ({{ inspectConversation.id }})
              </div>
            </div>
          </div>
          <div class="d-flex align-center">
            <v-chip v-if="isLiveStreaming" color="warning" size="small" class="mr-2" prepend-icon="mdi-radiobox-marked mdi-spin">
              Réponse en direct (SSE Stream)...
            </v-chip>
            <v-chip v-else color="success" size="small" class="mr-2" prepend-icon="mdi-check-circle-outline">
              Écoute SSE Active
            </v-chip>
            <v-btn icon="mdi-close" variant="text" size="small" @click="closeLiveConversationModal"></v-btn>
          </div>
        </v-card-title>

        <v-card-text ref="inspectChatBoxRef" class="flex-grow-1 overflow-y-auto pa-4" style="max-height: 60vh;">
          <div v-if="!inspectConversation?.messages?.length" class="text-center text-disabled pa-8">
            Aucun message dans cette conversation.
          </div>

          <div
            v-for="(msg, idx) in inspectConversation?.messages || []"
            :key="idx"
            :class="['d-flex mb-4', msg.role === 'USER' ? 'justify-end' : 'justify-start']"
          >
            <div :class="['d-flex align-start max-w-75', msg.role === 'USER' ? 'flex-row-reverse' : 'flex-row']">
              <v-avatar size="32" :color="msg.role === 'USER' ? 'primary' : 'secondary'" class="mx-2">
                <v-icon :icon="msg.role === 'USER' ? 'mdi-account' : 'mdi-robot'" size="18"></v-icon>
              </v-avatar>
              <v-card
                :color="msg.role === 'USER' ? 'primary' : 'surface-variant'"
                variant="flat"
                class="pa-3 rounded-lg"
                elevation="1"
              >
                <div class="text-caption text-medium-emphasis mb-1 font-weight-bold">
                  {{ msg.role === 'USER' ? (inspectConversation?.user?.email || 'Utilisateur') : 'Assistant IA' }}
                </div>
                <div v-if="msg.role === 'USER'" class="text-body-2 white-space-pre-wrap">{{ msg.content }}</div>
                <div v-else class="text-body-2 markdown-body" v-html="renderMarkdown(msg.content || '...')"></div>
              </v-card>
            </div>
          </div>
        </v-card-text>

        <v-divider></v-divider>
        <v-card-actions class="pa-3 justify-end">
          <v-btn color="primary" variant="flat" @click="closeLiveConversationModal">Fermer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useTheme } from "vuetify";
import { marked } from "marked";
import { useAuthStore } from "./stores/auth";
import { useChatStore } from "./stores/chat";
import { useBackofficeStore } from "./stores/backoffice";

const theme = useTheme();
const authStore = useAuthStore();
const chatStore = useChatStore();
const backofficeStore = useBackofficeStore();

const themeMode = ref<"system" | "light" | "dark">((localStorage.getItem("themeMode") as any) || "system");

const themeModeIcon = computed(() => {
  if (themeMode.value === "light") return "mdi-weather-sunny";
  if (themeMode.value === "dark") return "mdi-weather-night";
  return "mdi-monitor";
});

function applyTheme() {
  if (themeMode.value === "system") {
    const isDark = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    theme.global.name.value = isDark ? "dark" : "light";
  } else {
    theme.global.name.value = themeMode.value;
  }
}

function setThemeMode(mode: "system" | "light" | "dark") {
  themeMode.value = mode;
  localStorage.setItem("themeMode", mode);
  applyTheme();
}

applyTheme();

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemThemeChange = (e: MediaQueryListEvent) => {
    if (themeMode.value === "system") {
      theme.global.name.value = e.matches ? "dark" : "light";
    }
  };
  mediaQuery.addEventListener("change", onSystemThemeChange);
  onUnmounted(() => {
    mediaQuery.removeEventListener("change", onSystemThemeChange);
  });
}

const authTab = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const role = ref<"USER" | "ADMIN">("USER");
const authError = ref("");
const authLoading = ref(false);

const currentView = ref<"chat" | "admin" | "debug">("chat");
const promptInput = ref("");
const chatBoxRef = ref<any>(null);

const showCreateUserDialog = ref(false);
const newUserEmail = ref("");
const newUserPassword = ref("");
const newUserRole = ref<"USER" | "ADMIN">("USER");

const adminTab = ref<"users" | "conversations">("users");
const showLiveConversationDialog = ref(false);
const inspectConversation = ref<any>(null);
const isLiveStreaming = ref(false);
const inspectStreamCleanup = ref<(() => void) | null>(null);
const inspectChatBoxRef = ref<any>(null);

// Edit user dialog state
const showEditUserDialog = ref(false);
const editUserId = ref("");
const editUserEmail = ref("");
const editUserRole = ref<"USER" | "ADMIN">("USER");
const editUserResetPassword = ref(false);
const editUserLoading = ref(false);

// Generated password dialog state
const showGeneratedPasswordDialog = ref(false);
const generatedPassword = ref("");

async function openLiveConversationModal(id: string) {
  if (inspectStreamCleanup.value) {
    inspectStreamCleanup.value();
    inspectStreamCleanup.value = null;
  }

  inspectConversation.value = await backofficeStore.getAdminConversation(id);
  showLiveConversationDialog.value = true;
  isLiveStreaming.value = false;

  const cleanup = authStore.sdk.connectAdminConversationStream(id, {
    onToken: async (chunk: string) => {
      isLiveStreaming.value = true;
      if (!inspectConversation.value) return;
      const msgs = inspectConversation.value.messages;
      const lastMsg = msgs[msgs.length - 1];

      if (lastMsg && lastMsg.role === "ASSISTANT") {
        lastMsg.content += chunk;
      } else {
        msgs.push({ role: "ASSISTANT", content: chunk });
      }
      await scrollInspectToBottom();
    },
    onStatus: (status: string) => {
      if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
        isLiveStreaming.value = false;
      }
    },
    onError: () => {
      isLiveStreaming.value = false;
    },
  });

  inspectStreamCleanup.value = cleanup;
  await scrollInspectToBottom();
}

function closeLiveConversationModal() {
  if (inspectStreamCleanup.value) {
    inspectStreamCleanup.value();
    inspectStreamCleanup.value = null;
  }
  showLiveConversationDialog.value = false;
  inspectConversation.value = null;
  isLiveStreaming.value = false;
}

async function scrollInspectToBottom() {
  await nextTick();
  if (inspectChatBoxRef.value?.$el) {
    inspectChatBoxRef.value.$el.scrollTop = inspectChatBoxRef.value.$el.scrollHeight;
  }
}

function openEditUserDialog(user: any) {
  editUserId.value = user.id;
  editUserEmail.value = user.email;
  editUserRole.value = user.role;
  editUserResetPassword.value = false;
  showEditUserDialog.value = true;
}

async function handleEditUser() {
  editUserLoading.value = true;
  try {
    const result = await backofficeStore.updateUser(editUserId.value, {
      email: editUserEmail.value,
      role: editUserRole.value,
      resetPassword: editUserResetPassword.value,
    });
    showEditUserDialog.value = false;
    if (result?.generatedPassword) {
      generatedPassword.value = result.generatedPassword;
      showGeneratedPasswordDialog.value = true;
    }
  } finally {
    editUserLoading.value = false;
  }
}

const debugLogs = ref<any[]>([]);
let debugEventSource: EventSource | null = null;

async function handleAuthSubmit() {
  authError.value = "";
  authLoading.value = true;
  try {
    if (authTab.value === "login") {
      await authStore.login(email.value, password.value);
    } else {
      await authStore.register(email.value, password.value, role.value);
    }
    await chatStore.loadConversations();
  } catch (err: any) {
    authError.value = err.response?.data?.error || err.message || "Erreur d'authentification";
  } finally {
    authLoading.value = false;
  }
}

function handleLogout() {
  authStore.logout();
  if (debugEventSource) debugEventSource.close();
}

async function handleSend() {
  if (!promptInput.value.trim() || chatStore.isStreaming) return;
  const text = promptInput.value;
  promptInput.value = "";
  await chatStore.sendMessage(text);
  await scrollToBottom();
}

async function handleDeleteConversation(id: string) {
  await authStore.sdk.deleteConversation(id);
  await chatStore.loadConversations();
  if (chatStore.currentConversation?.id === id) {
    chatStore.currentConversation = null;
  }
}

async function handleCreateUser() {
  if (!newUserEmail.value || !newUserPassword.value) return;
  await backofficeStore.createUser({
    email: newUserEmail.value,
    password: newUserPassword.value,
    role: newUserRole.value,
  });
  showCreateUserDialog.value = false;
  newUserEmail.value = "";
  newUserPassword.value = "";
}

async function handleDeleteUser(id: string) {
  await backofficeStore.deleteUser(id);
}

function renderMarkdown(content: string): string {
  if (!content) return "";
  try {
    return marked.parse(content, { gfm: true, breaks: true }) as string;
  } catch {
    return content;
  }
}

function startEventBusDebugStream() {
  if (debugEventSource) debugEventSource.close();
  const streamUrl = `http://localhost:8000/sse/v1/debug/eventbus?token=${authStore.token}`;
  debugEventSource = new EventSource(streamUrl);

  const handleEvent = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      debugLogs.value.unshift(data);
      if (debugLogs.value.length > 100) debugLogs.value.pop();
    } catch {}
  };

  debugEventSource.onmessage = handleEvent;
  debugEventSource.addEventListener("eventbus.debug", handleEvent);
}

async function scrollToBottom() {
  await nextTick();
  if (chatBoxRef.value?.$el) {
    chatBoxRef.value.$el.scrollTop = chatBoxRef.value.$el.scrollHeight;
  }
}

onMounted(async () => {
  if (authStore.token) {
    try {
      await authStore.fetchMe();
      await chatStore.loadConversations();
    } catch {
      authStore.logout();
    }
  }
});
</script>

<style scoped>
.white-space-pre-wrap {
  white-space: pre-wrap;
}
.max-w-75 {
  max-width: 75%;
}
.font-weight-mono {
  font-family: monospace;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0.5rem 0;
  width: 100%;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(128, 128, 128, 0.3);
  padding: 6px 12px;
  text-align: left;
}
.markdown-body :deep(th) {
  background-color: rgba(128, 128, 128, 0.15);
  font-weight: bold;
}
.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 0.5rem 0;
}
.markdown-body :deep(pre) {
  background-color: rgba(0, 0, 0, 0.2);
  padding: 8px 12px;
  border-radius: 6px;
  overflow-x: auto;
}
.markdown-body :deep(code) {
  font-family: monospace;
  font-size: 0.9em;
}
.markdown-body :deep(p) {
  margin-bottom: 0.5rem;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
