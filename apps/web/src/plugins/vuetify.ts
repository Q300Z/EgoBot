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
          primary: "#F97316", // Duhamel Orange High Contrast Dark
          secondary: "#47637A", // Duhamel Slate Navy Light
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
          primary: "#182630", // Duhamel Dark Navy Slate (Contrast > 14:1)
          secondary: "#B84300", // Duhamel Copper Orange High Contrast (Contrast > 5.2:1)
          accent: "#9E3800",
          background: "#F4F6F8",
          surface: "#FFFFFF",
          "surface-variant": "#E6ECF0", // High contrast surface variant
          error: "#991B1B", // Dark red contrast > 7:1
          info: "#0369A1", // Dark blue contrast > 5:1
          success: "#047857", // Dark green contrast > 5:1
          warning: "#853B00", // Dark amber contrast > 7.1:1
          "on-primary": "#FFFFFF",
          "on-secondary": "#FFFFFF",
          "on-warning": "#FFFFFF",
          "on-surface": "#182630",
        },
      },
    },
  },
});
