<template>
  <v-row class="fill-height ma-0 pa-4">
    <v-col cols="12">
      <v-card class="d-flex flex-column fill-height rounded-lg border bg-grey-darken-4">
        <v-card-title class="d-flex align-center justify-space-between border-b pa-3">
          <div class="d-flex align-center">
            <v-icon icon="mdi-console" color="accent" class="mr-2"></v-icon>
            <span class="text-h6 font-weight-bold text-accent">Live EventBus Monitor (SSE)</span>
          </div>
          <v-btn color="error" variant="text" size="small" prepend-icon="mdi-trash-can" @click="debugLogs = []">
            Effacer
          </v-btn>
        </v-card-title>
        <v-card-text class="flex-grow-1 overflow-y-auto pa-4 font-weight-mono text-caption">
          <div v-for="(log, i) in debugLogs" :key="i" class="mb-2 pb-2 border-b border-grey-darken-3">
            <span class="text-accent">[{{ log.timestamp }}]</span>
            <span class="text-warning font-weight-bold mx-2">TOPIC: {{ log.topic }}</span>
            <span class="text-grey">corrId: {{ log.correlationId }}</span>
            <pre class="text-green-lighten-2 mt-1">{{ JSON.stringify(log.payload, null, 2) }}</pre>
          </div>
          <div v-if="debugLogs.length === 0" class="text-disabled text-center pa-8">
            En attente des événements de l'EventBus...
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useAuthStore } from "../stores/auth";

const authStore = useAuthStore();
const debugLogs = ref<any[]>([]);
let debugEventSource: EventSource | null = null;

function startEventBusDebugStream() {
  if (debugEventSource) debugEventSource.close();
  const streamUrl = `http://localhost:8000/sse/v1/debug/eventbus?token=${authStore.token}`;
  debugEventSource = new EventSource(streamUrl);

  const handleEvent = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      debugLogs.value.unshift(data);
      if (debugLogs.value.length > 100) debugLogs.value.pop();
    } catch {}
  };

  debugEventSource.onmessage = handleEvent;
  debugEventSource.addEventListener("eventbus.debug", handleEvent);
}

onMounted(() => {
  startEventBusDebugStream();
});

onUnmounted(() => {
  if (debugEventSource) debugEventSource.close();
});
</script>

<style scoped>
.font-weight-mono {
  font-family: monospace;
}
</style>
