import { createRouter, createWebHistory } from "vue-router";
import AuthView from "../views/AuthView.vue";
import ChatView from "../views/ChatView.vue";
import AdminView from "../views/AdminView.vue";
import DebugView from "../views/DebugView.vue";

const routes = [
  { path: "/", redirect: "/chat" },
  { path: "/login", name: "login", component: AuthView },
  { path: "/chat", name: "chat", component: ChatView },
  { path: "/chat/:id", name: "chat-detail", component: ChatView },
  { path: "/admin", name: "admin", component: AdminView },
  { path: "/admin/users/:userId/conversations", name: "admin-user-conversations", component: AdminView },
  { path: "/admin/conversations/:id", name: "admin-conversation-inspect", component: AdminView },
  { path: "/debug", name: "debug", component: DebugView },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
