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
          primary: "#F97316", // Duhamel Orange
          secondary: "#5B82A0", // Slate bleu éclairci — lisible en texte/icône sur fond sombre
          accent: "#FDBA8C",
          background: "#0E151C", // Fond navy profond
          surface: "#1B2733", // Cartes, barre d'app — nettement détaché du fond
          "surface-variant": "#2A3844", // Bulles de message, encarts
          error: "#F87171", // Rouge éclairci pour fond sombre
          info: "#38BDF8",
          success: "#34D399",
          warning: "#FBBF24",
          "on-primary": "#FFFFFF",
          "on-secondary": "#FFFFFF",
          "on-background": "#E6ECF1",
          "on-surface": "#E6ECF1", // Blanc cassé — moins éblouissant que le blanc pur
          "on-surface-variant": "#CBD5E0",
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
