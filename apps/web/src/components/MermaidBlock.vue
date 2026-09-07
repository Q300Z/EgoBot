<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import { useTheme } from "vuetify";
import mermaid from "mermaid";

const props = defineProps<{ code: string }>();

const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);

const svg = ref("");
const hasError = ref(false);
let renderSeq = 0;

async function renderDiagram() {
  // securityLevel "strict" est déjà la valeur par défaut de Mermaid : elle
  // neutralise les scripts et les liens cliquables dans les labels générés.
  // Déclaré explicitement pour documenter ce choix plutôt que le modifier.
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: isDark.value ? "dark" : "default",
  });

  hasError.value = false;
  const id = `mermaid-${Date.now()}-${++renderSeq}`;
  try {
    const { svg: rendered } = await mermaid.render(id, props.code);
    svg.value = rendered;
  } catch {
    hasError.value = true;
  }
}

onMounted(renderDiagram);
watch([() => props.code, isDark], renderDiagram);
</script>

<template>
  <div v-if="!hasError" class="mermaid-block" v-html="svg" />
  <pre v-else class="mermaid-block-fallback">{{ code }}</pre>
</template>

<style scoped>
.mermaid-block {
  margin: 0.5rem 0;
  max-width: 100%;
  overflow-x: auto;
}

.mermaid-block-fallback {
  white-space: pre-wrap;
  font-size: 0.85em;
  opacity: 0.8;
}
</style>
