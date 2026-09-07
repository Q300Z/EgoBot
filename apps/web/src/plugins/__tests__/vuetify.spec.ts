import { describe, it, expect } from "vitest";
import vuetify from "../vuetify";

describe("Vuetify Plugin", () => {
  it("should initialize vuetify plugin properly", () => {
    expect(vuetify).toBeDefined();
    expect(vuetify.theme).toBeDefined();
  });

  it("should define both dark and light themes", () => {
    // L'instance de thème expose `themes` (ref), pas `definitions`.
    const themes = (vuetify.theme as any).themes.value;
    expect(themes.dark).toBeDefined();
    expect(themes.light).toBeDefined();
  });

  it("should use either dark or light as default theme", () => {
    // Le thème actif est lu via `name` (ref) ; `defaultTheme` est une option
    // de création, non réexposée sur l'instance.
    const activeTheme = (vuetify.theme as any).name.value;
    expect(["dark", "light"]).toContain(activeTheme);
  });
});
