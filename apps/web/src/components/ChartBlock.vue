<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "vuetify";
import { Bar } from "vue-chartjs";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

const props = defineProps<{ json: string }>();

interface ChartSpec {
  type?: string;
  title?: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);

// Un seul jeu de données par graphique (cf. build-rich-content-block.ts) : une
// seule teinte catégorielle (slot 1 de la palette validée), pas de légende —
// le titre nomme déjà la série.
const colors = computed(() =>
  isDark.value
    ? {
        bar: "#3987e5",
        grid: "#2c2c2a",
        baseline: "#383835",
        muted: "#898781",
        text: "#ffffff",
      }
    : {
        bar: "#2a78d6",
        grid: "#e1e0d9",
        baseline: "#c3c2b7",
        muted: "#898781",
        text: "#0b0b0b",
      },
);

const parsed = computed<ChartSpec | null>(() => {
  try {
    const value = JSON.parse(props.json);
    if (!value || !Array.isArray(value.labels) || !Array.isArray(value.datasets)) {
      return null;
    }
    return value as ChartSpec;
  } catch {
    return null;
  }
});

const isBarChart = computed(() => (parsed.value?.type ?? "bar") === "bar");

const chartData = computed(() => ({
  labels: parsed.value?.labels ?? [],
  datasets: (parsed.value?.datasets ?? []).map((dataset) => ({
    label: dataset.label,
    data: dataset.data,
    backgroundColor: colors.value.bar,
    borderRadius: 4,
    borderSkipped: false,
  })),
}));

const chartOptions = computed(() => ({
  responsive: true,
  plugins: {
    legend: { display: false },
    title: {
      display: Boolean(parsed.value?.title),
      text: parsed.value?.title ?? "",
      color: colors.value.text,
    },
    tooltip: { enabled: true },
  },
  scales: {
    x: {
      grid: { display: false },
      border: { color: colors.value.baseline },
      ticks: { color: colors.value.muted },
    },
    y: {
      beginAtZero: true,
      grid: { color: colors.value.grid },
      border: { color: colors.value.baseline },
      ticks: { color: colors.value.muted, precision: 0 },
    },
  },
}));
</script>

<template>
  <div v-if="parsed && isBarChart" class="chart-block">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
  <pre v-else class="chart-block-fallback">{{ json }}</pre>
</template>

<style scoped>
.chart-block {
  max-width: 420px;
  margin: 0.5rem 0;
}

.chart-block-fallback {
  white-space: pre-wrap;
  font-size: 0.85em;
  opacity: 0.8;
}
</style>
