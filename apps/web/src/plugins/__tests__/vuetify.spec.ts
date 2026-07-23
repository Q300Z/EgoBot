import { describe, it, expect } from "vitest";
import vuetify from "../vuetify";

describe("Vuetify Plugin", () => {
  it("should initialize vuetify plugin properly", () => {
    expect(vuetify).toBeDefined();
    expect(vuetify.theme).toBeDefined();
  });
});
