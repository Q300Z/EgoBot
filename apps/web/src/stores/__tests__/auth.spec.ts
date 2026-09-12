import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAuthStore } from "../auth";

describe("Auth Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it("should initialize with token from localStorage if present", () => {
    localStorage.setItem("token", "initial-test-token");
    const authStore = useAuthStore();
    expect(authStore.token).toBe("initial-test-token");
    expect(authStore.user).toBeNull();
  });

  it("should initialize with null token if localStorage is empty", () => {
    const authStore = useAuthStore();
    expect(authStore.token).toBeNull();
    expect(authStore.user).toBeNull();
  });

  it("should perform login successfully and store token in localStorage", async () => {
    const authStore = useAuthStore();
    const mockUser = { id: "1", email: "user@test.com", role: "USER" };
    const mockToken = "fake-jwt-token";

    vi.spyOn(authStore.sdk, "login").mockResolvedValue({
      token: mockToken,
      user: mockUser,
    });

    await authStore.login("user@test.com", "password123");

    expect(authStore.token).toBe(mockToken);
    expect(authStore.user).toEqual(mockUser);
    expect(localStorage.getItem("token")).toBe(mockToken);
  });

  it("should perform register successfully and store token in localStorage", async () => {
    const authStore = useAuthStore();
    const mockUser = { id: "2", email: "admin@test.com", role: "ADMIN" };
    const mockToken = "fake-admin-token";

    vi.spyOn(authStore.sdk, "register").mockResolvedValue({
      token: mockToken,
      user: mockUser,
    });

    // Pas de role : l'inscription publique cree toujours un compte USER.
    await authStore.register("admin@test.com", "password123");

    expect(authStore.token).toBe(mockToken);
    expect(authStore.user).toEqual(mockUser);
    expect(localStorage.getItem("token")).toBe(mockToken);
  });

  it("should fetch current user with fetchMe if token is present", async () => {
    localStorage.setItem("token", "existing-token");
    const authStore = useAuthStore();
    const mockUser = { id: "1", email: "user@test.com", role: "USER" };

    vi.spyOn(authStore.sdk, "getMe").mockResolvedValue(mockUser);

    await authStore.fetchMe();

    expect(authStore.user).toEqual(mockUser);
  });

  it("should not call getMe if token is missing", async () => {
    const authStore = useAuthStore();
    const getMeSpy = vi.spyOn(authStore.sdk, "getMe");

    await authStore.fetchMe();

    expect(getMeSpy).not.toHaveBeenCalled();
    expect(authStore.user).toBeNull();
  });

  it("should logout if fetchMe fails", async () => {
    localStorage.setItem("token", "invalid-token");
    const authStore = useAuthStore();

    vi.spyOn(authStore.sdk, "getMe").mockRejectedValue(new Error("Unauthorized"));

    await authStore.fetchMe();

    expect(authStore.token).toBeNull();
    expect(authStore.user).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("should clear token, user and localStorage on logout", () => {
    localStorage.setItem("token", "test-token");
    const authStore = useAuthStore();
    authStore.user = { id: "1", email: "test@test.com" };

    authStore.logout();

    expect(authStore.token).toBeNull();
    expect(authStore.user).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });
});
