import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: "dark",
    themes: {
      dark: {
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
    },
  },
});
