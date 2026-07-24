<template>
  <v-menu location="bottom end">
    <template #activator="{ props }">
      <v-btn icon v-bind="props" class="mr-1" title="Changer le thème" aria-label="Sélecteur de thème">
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
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { useTheme } from "vuetify";

const theme = useTheme();
const themeMode = ref<"system" | "light" | "dark">((localStorage.getItem("themeMode") as any) || "system");

const themeModeIcon = computed(() => {
  if (themeMode.value === "light") return "mdi-weather-sunny";
  if (themeMode.value === "dark") return "mdi-weather-night";
  return "mdi-monitor";
});

function applyThemeName(name: "dark" | "light") {
  if (typeof (theme as any).change === "function") {
    (theme as any).change(name);
  } else {
    theme.global.name.value = name;
  }
}

function applyTheme() {
  if (themeMode.value === "system") {
    const isDark = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyThemeName(isDark ? "dark" : "light");
  } else {
    applyThemeName(themeMode.value);
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
      applyThemeName(e.matches ? "dark" : "light");
    }
  };
  mediaQuery.addEventListener("change", onSystemThemeChange);
  onUnmounted(() => {
    mediaQuery.removeEventListener("change", onSystemThemeChange);
  });
}
</script>
