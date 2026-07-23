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
          primary: "#EA670C", // Duhamel Orange Accent
          secondary: "#385266", // Duhamel Slate Navy Light
          accent: "#FDF0E8",
          background: "#101920", // Deep Duhamel Navy Dark
          surface: "#182630", // Duhamel Dark Navy
          "surface-variant": "#243644", // Duhamel Surface Variant
          error: "#EF4444",
          info: "#38BDF8",
          success: "#10B981",
          warning: "#F59E0B",
          "on-primary": "#FFFFFF",
          "on-surface": "#F8FAFC",
        },
      },
      light: {
        dark: false,
        colors: {
          primary: "#182630", // Duhamel Dark Navy Slate
          secondary: "#EA670C", // Duhamel Orange Accent
          accent: "#D05400",
          background: "#F4F6F8",
          surface: "#FFFFFF",
          "surface-variant": "#EBF0F3",
          error: "#DC2626",
          info: "#0284C7",
          success: "#059669",
          warning: "#D97706",
          "on-primary": "#FFFFFF",
          "on-surface": "#182630",
        },
      },
    },
  },
});
