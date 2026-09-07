import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { LogibotClientSDK } from "./index.js";

vi.mock("axios");

describe("LogibotClientSDK", () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      defaults: {
        baseURL: "http://localhost:3000",
        headers: {
          common: {},
        },
      },
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    (axios.create as any).mockReturnValue(mockAxiosInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with baseUrl and optional token", () => {
    const sdk = new LogibotClientSDK({
      baseUrl: "http://api.egobot.test",
      token: "initial-token",
    });

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: "http://api.egobot.test",
      headers: { "Content-Type": "application/json" },
    });
    expect(mockAxiosInstance.defaults.headers.common["Authorization"]).toBe("Bearer initial-token");
  });

  it("should set token correctly", () => {
    const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
    sdk.setToken("new-token");
    expect(mockAxiosInstance.defaults.headers.common["Authorization"]).toBe("Bearer new-token");
  });

  describe("Auth API", () => {
    it("should login and set auth token on success", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { token: "jwt-token-123", user: { id: "u1" } },
      });

      const res = await sdk.login("test@test.com", "password123");
      expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/v1/auth/login", {
        email: "test@test.com",
        password: "password123",
      });
      expect(res).toEqual({ token: "jwt-token-123", user: { id: "u1" } });
      expect(mockAxiosInstance.defaults.headers.common["Authorization"]).toBe("Bearer jwt-token-123");
    });

    it("should login without token response without breaking setToken", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { message: "no token" },
      });

      const res = await sdk.login("test@test.com", "password123");
      expect(res).toEqual({ message: "no token" });
    });

    it("should register user and set token", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { token: "jwt-token-456", user: { id: "u2" } },
      });

      const res = await sdk.register("test@test.com", "password123", "ADMIN");
      expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/v1/auth/register", {
        email: "test@test.com",
        password: "password123",
        role: "ADMIN",
      });
      expect(res).toEqual({ token: "jwt-token-456", user: { id: "u2" } });
      expect(mockAxiosInstance.defaults.headers.common["Authorization"]).toBe("Bearer jwt-token-456");
    });

    it("should fetch current authenticated user getMe()", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { id: "u1", email: "test@test.com" },
      });

      const res = await sdk.getMe();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v1/auth/me");
      expect(res).toEqual({ id: "u1", email: "test@test.com" });
    });
  });

  describe("Messages & Conversations API", () => {
    it("should create a message", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { job_id: "j1", conversation_id: "c1" },
      });

      const res = await sdk.createMessage("Hello bot", "c1", "gpt-4");
      expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/v1/messages", {
        prompt: "Hello bot",
        conversation_id: "c1",
        model: "gpt-4",
      });
      expect(res).toEqual({ job_id: "j1", conversation_id: "c1" });
    });

    it("should get all conversations", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [{ id: "c1" }, { id: "c2" }],
      });

      const res = await sdk.getConversations();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v1/conversations");
      expect(res).toEqual([{ id: "c1" }, { id: "c2" }]);
    });

    it("should get a single conversation by id", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { id: "c1", title: "Conv 1" },
      });

      const res = await sdk.getConversation("c1");
      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v1/conversations/c1");
      expect(res).toEqual({ id: "c1", title: "Conv 1" });
    });

    it("should delete a conversation by id", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.delete.mockResolvedValueOnce({
        data: { success: true },
      });

      const res = await sdk.deleteConversation("c1");
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith("/api/v1/conversations/c1");
      expect(res).toEqual({ success: true });
    });
  });

  describe("Admin API", () => {
    it("should get users list", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [{ id: "u1" }],
      });

      const res = await sdk.getUsers();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v1/admin/users");
      expect(res).toEqual([{ id: "u1" }]);
    });

    it("should create user", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      const newUser = { email: "admin@test.com", password: "password", role: "ADMIN" };
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { id: "u2", ...newUser },
      });

      const res = await sdk.createUser(newUser);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/v1/admin/users", newUser);
      expect(res).toEqual({ id: "u2", ...newUser });
    });

    it("should delete user", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.delete.mockResolvedValueOnce({
        data: { success: true },
      });

      const res = await sdk.deleteUser("u2");
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith("/api/v1/admin/users/u2");
      expect(res).toEqual({ success: true });
    });

    it("should update user details and handle password reset response", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.put.mockResolvedValueOnce({
        data: { id: "u2", email: "updated@test.com", role: "USER", generatedPassword: "abc" },
      });

      const res = await sdk.updateUser("u2", { email: "updated@test.com", resetPassword: true });
      expect(mockAxiosInstance.put).toHaveBeenCalledWith("/api/v1/admin/users/u2", {
        email: "updated@test.com",
        resetPassword: true,
      });
      expect(res).toEqual({ id: "u2", email: "updated@test.com", role: "USER", generatedPassword: "abc" });
    });

    it("should fetch admin conversations list and single conversation", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [{ id: "conv-1", title: "Conv 1" }],
      });

      const resList = await sdk.getAdminConversations("u1");
      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v1/admin/conversations", {
        params: { userId: "u1" },
      });
      expect(resList).toEqual([{ id: "conv-1", title: "Conv 1" }]);

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { id: "conv-1", title: "Conv 1", messages: [] },
      });
      const resSingle = await sdk.getAdminConversation("conv-1");
      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v1/admin/conversations/conv-1");
      expect(resSingle).toEqual({ id: "conv-1", title: "Conv 1", messages: [] });
    });

    it("should fetch user conversations via getUserConversations", async () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [{ id: "conv-user-1", title: "User Conv 1", _count: { messages: 2 } }],
      });

      const res = await sdk.getUserConversations("u123");
      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/v1/admin/users/u123/conversations");
      expect(res).toEqual([{ id: "conv-user-1", title: "User Conv 1", _count: { messages: 2 } }]);
    });
  });

  describe("connectJobStream (SSE)", () => {
    class MockEventSource {
      url: string;
      onmessage: ((event: any) => void) | null = null;
      onerror: ((err: any) => void) | null = null;
      closed = false;
      listeners: Map<string, Array<(event: any) => void>> = new Map();

      constructor(url: string) {
        this.url = url;
      }

      addEventListener(type: string, listener: (event: any) => void) {
        if (!this.listeners.has(type)) {
          this.listeners.set(type, []);
        }
        this.listeners.get(type)!.push(listener);
      }

      emit(type: string, data: any) {
        const event = { data: typeof data === "string" ? data : JSON.stringify(data) };
        if (this.onmessage) {
          this.onmessage(event);
        }
        const callbacks = this.listeners.get(type) || [];
        for (const cb of callbacks) {
          cb(event);
        }
      }

      close() {
        this.closed = true;
      }
    }

    beforeEach(() => {
      (globalThis as any).EventSource = MockEventSource;
    });

    it("should open EventSource at /sse/:jobId without token in URL", () => {
      let createdEsInstance: MockEventSource | null = null;
      (globalThis as any).EventSource = class extends MockEventSource {
        constructor(url: string) {
          super(url);
          createdEsInstance = this;
        }
      };

      const sdk = new LogibotClientSDK({
        baseUrl: "http://localhost:3000",
        token: "my-token",
      });

      const unsubscribe = sdk.connectJobStream("job-123", {});
      expect(createdEsInstance!.url).toBe("http://localhost:3000/sse/job-123");
      expect(unsubscribe).toBeTypeOf("function");
      unsubscribe();
    });

    it("should handle token, status, statistics, unknown, invalid JSON, and error events", () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000" });

      const onToken = vi.fn();
      const onStatus = vi.fn();
      const onStatistics = vi.fn();
      const onUnknownEvent = vi.fn();
      const onError = vi.fn();

      let createdEsInstance: MockEventSource | null = null;
      (globalThis as any).EventSource = class extends MockEventSource {
        constructor(url: string) {
          super(url);
          createdEsInstance = this;
        }
      };

      const unsubscribe = sdk.connectJobStream("job-999", {
        onToken,
        onStatus,
        onStatistics,
        onUnknownEvent,
        onError,
      });

      expect(createdEsInstance).not.toBeNull();
      const es = createdEsInstance!;

      // 1. Token event standard (type: token, payload.chunk)
      es.onmessage!({ data: JSON.stringify({ type: "token", payload: { chunk: "Hello " } }) });
      expect(onToken).toHaveBeenCalledWith("Hello ");

      // 2. Token event fallback (kind: token, payload.data.chunk)
      es.onmessage!({ data: JSON.stringify({ kind: "token", payload: { data: { chunk: "World" } } }) });
      expect(onToken).toHaveBeenCalledWith("World");

      // 3. Status event
      es.onmessage!({ data: JSON.stringify({ type: "status", payload: { status: "COMPLETED", error: undefined } }) });
      expect(onStatus).toHaveBeenCalledWith("COMPLETED", undefined);

      // 4. Statistics event
      es.onmessage!({ data: JSON.stringify({ type: "statistics", payload: { generated_tokens: 20 } }) });
      expect(onStatistics).toHaveBeenCalledWith({ generated_tokens: 20 });

      // 5. Unknown event
      es.onmessage!({ data: JSON.stringify({ type: "ping", payload: { pong: true } }) });
      expect(onUnknownEvent).toHaveBeenCalledWith("ping", { pong: true });

      // 6. Malformed JSON (should not throw or crash)
      expect(() => {
        es.onmessage!({ data: "{ invalid json " });
      }).not.toThrow();

      // 7. Error event
      es.onerror!({ message: "Network connection lost" });
      expect(onError).toHaveBeenCalledWith({ message: "Network connection lost" });
      expect(es.closed).toBe(true);

      // 8. Call unsubscribe
      unsubscribe();
    });

    it("should connect to admin conversation SSE stream and emit tokens/status", () => {
      const sdk = new LogibotClientSDK({ baseUrl: "http://localhost:3000", token: "admin-jwt" });
      const onToken = vi.fn();
      const onStatus = vi.fn();

      let createdEsInstance: MockEventSource | null = null;
      (globalThis as any).EventSource = class extends MockEventSource {
        constructor(url: string) {
          super(url);
          createdEsInstance = this;
        }
      };

      const unsubscribe = sdk.connectAdminConversationStream("conv-777", { onToken, onStatus });
      expect(createdEsInstance!.url).toBe("http://localhost:3000/sse/v1/admin/conversations/conv-777?token=admin-jwt");

      createdEsInstance!.emit("job.progress", { type: "job.progress", payload: { kind: "token", chunk: "Admin live token " } });
      expect(onToken).toHaveBeenCalledWith("Admin live token ");

      createdEsInstance!.emit("job.completed", { type: "job.completed", payload: { status: "COMPLETED" } });
      expect(onStatus).toHaveBeenCalledWith("COMPLETED");

      unsubscribe();
      expect(createdEsInstance!.closed).toBe(true);
    });
  });
});
