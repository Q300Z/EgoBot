import { describe, it, expect } from "vitest";
import vuetify from "../vuetify";

describe("Vuetify Plugin", () => {
  it("should initialize vuetify plugin properly", () => {
    expect(vuetify).toBeDefined();
    expect(vuetify.theme).toBeDefined();
  });

  it("should define both dark and light themes", () => {
    const themeDefinitions = (vuetify.theme as any).themes?.value || (vuetify.theme as any).definitions;
    expect(themeDefinitions.dark).toBeDefined();
    expect(themeDefinitions.light).toBeDefined();
  });

  it("should use either dark or light as default theme", () => {
    const defaultTheme = (vuetify.theme as any).name?.value || (vuetify.theme as any).defaultTheme;
    expect(["dark", "light"]).toContain(defaultTheme);
  });
});
