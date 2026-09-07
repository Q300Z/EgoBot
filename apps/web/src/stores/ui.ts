import { defineStore } from "pinia";
import { ref } from "vue";

export const useUiStore = defineStore("ui", () => {
  const drawer = ref(true);

  function toggleDrawer() {
    drawer.value = !drawer.value;
  }

  return {
    drawer,
    toggleDrawer,
  };
});
