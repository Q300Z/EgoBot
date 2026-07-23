import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/chat" },
  { path: "/chat", name: "chat" },
  { path: "/chat/:id", name: "chat-detail" },
  { path: "/admin", name: "admin" },
  { path: "/admin/users/:userId/conversations", name: "admin-user-conversations" },
  { path: "/admin/conversations/:id", name: "admin-conversation-inspect" },
  { path: "/debug", name: "debug" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
