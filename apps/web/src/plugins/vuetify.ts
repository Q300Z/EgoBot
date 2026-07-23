import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

// Détection défensive : window.matchMedia peut ne pas exister (ex: jsdom en test)
const prefersDark =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: prefersDark ? "dark" : "light",
    themes: {
      dark: {
        dark: true,
        colors: {
          primary: "#6366F1",
          secondary: "#8B5CF6",
          accent: "#06B6D4",
          background: "#0F172A",
          surface: "#1E293B",
          "surface-variant": "#334155",
          error: "#EF4444",
          info: "#3B82F6",
          success: "#10B981",
          warning: "#F59E0B",
        },
      },
      light: {
        dark: false,
        colors: {
          primary: "#4F46E5",
          secondary: "#7C3AED",
          accent: "#0891B2",
          background: "#F8FAFC",
          surface: "#FFFFFF",
          "surface-variant": "#F1F5F9",
          error: "#DC2626",
          info: "#2563EB",
          success: "#059669",
          warning: "#D97706",
        },
      },
    },
  },
});
