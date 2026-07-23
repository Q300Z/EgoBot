import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useBackofficeStore } from "../backoffice";
import { useAuthStore } from "../auth";

describe("Backoffice Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should load users using authStore.sdk", async () => {
    const authStore = useAuthStore();
    const backofficeStore = useBackofficeStore();
    const mockUsers = [
      { id: "1", email: "user1@test.com", role: "USER" },
      { id: "2", email: "admin@test.com", role: "ADMIN" },
    ];

    vi.spyOn(authStore.sdk, "getUsers").mockResolvedValue(mockUsers as any);

    await backofficeStore.loadUsers();

    expect(authStore.sdk.getUsers).toHaveBeenCalled();
    expect(backofficeStore.users).toEqual(mockUsers);
  });

  it("should create user and reload users list", async () => {
    const authStore = useAuthStore();
    const backofficeStore = useBackofficeStore();
    const newUser = { email: "new@test.com", password: "password", role: "USER" };
    const mockUsers = [{ id: "3", email: "new@test.com", role: "USER" }];

    const createUserSpy = vi.spyOn(authStore.sdk, "createUser").mockResolvedValue({ id: "3", ...newUser } as any);
    const getUsersSpy = vi.spyOn(authStore.sdk, "getUsers").mockResolvedValue(mockUsers as any);

    await backofficeStore.createUser(newUser);

    expect(createUserSpy).toHaveBeenCalledWith(newUser);
    expect(getUsersSpy).toHaveBeenCalled();
    expect(backofficeStore.users).toEqual(mockUsers);
  });

  it("should delete user and reload users list", async () => {
    const authStore = useAuthStore();
    const backofficeStore = useBackofficeStore();
    const userIdToDelete = "user-123";

    const deleteUserSpy = vi.spyOn(authStore.sdk, "deleteUser").mockResolvedValue({ success: true } as any);
    const getUsersSpy = vi.spyOn(authStore.sdk, "getUsers").mockResolvedValue([] as any);

    await backofficeStore.deleteUser(userIdToDelete);

    expect(deleteUserSpy).toHaveBeenCalledWith(userIdToDelete);
    expect(getUsersSpy).toHaveBeenCalled();
    expect(backofficeStore.users).toEqual([]);
  });
});
