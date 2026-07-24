import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useChatStore } from "../chat";
import { useAuthStore } from "../auth";

describe("Chat Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should load conversations list using authStore.sdk", async () => {
    const authStore = useAuthStore();
    const chatStore = useChatStore();
    const mockConversations = [
      { id: "conv-1", title: "Conv 1" },
      { id: "conv-2", title: "Conv 2" },
    ];

    vi.spyOn(authStore.sdk, "getConversations").mockResolvedValue(mockConversations as any);

    await chatStore.loadConversations();

    expect(authStore.sdk.getConversations).toHaveBeenCalled();
    expect(chatStore.conversations).toEqual(mockConversations);
  });

  it("should load single conversation detail", async () => {
    const authStore = useAuthStore();
    const chatStore = useChatStore();
    const mockConv = { id: "conv-1", title: "Conv 1", messages: [] };

    vi.spyOn(authStore.sdk, "getConversation").mockResolvedValue(mockConv as any);

    await chatStore.loadConversation("conv-1");

    expect(authStore.sdk.getConversation).toHaveBeenCalledWith("conv-1");
    expect(chatStore.currentConversation).toEqual(mockConv);
  });

  it("should send message to new conversation and process tokens via streaming", async () => {
    const authStore = useAuthStore();
    const chatStore = useChatStore();

    const mockJobResult = { job_id: "job-123", conversation_id: "conv-new" };
    const mockConvDetail = {
      id: "conv-new",
      title: "New Conv",
      messages: [
        { role: "USER", content: "Hello AI" },
        { role: "ASSISTANT", content: "" },
      ],
    };

    let streamCallbacks: any = null;
    const cleanupMock = vi.fn();

    vi.spyOn(authStore.sdk, "createMessage").mockResolvedValue(mockJobResult as any);
    vi.spyOn(authStore.sdk, "getConversation").mockResolvedValue(mockConvDetail as any);
    vi.spyOn(authStore.sdk, "getConversations").mockResolvedValue([mockConvDetail] as any);
    vi.spyOn(authStore.sdk, "connectJobStream").mockImplementation((jobId: string, callbacks: any) => {
      streamCallbacks = callbacks;
      return cleanupMock;
    });

    await chatStore.sendMessage("Hello AI");

    expect(authStore.sdk.createMessage).toHaveBeenCalledWith("Hello AI", undefined, "CHATBOT");
    expect(authStore.sdk.getConversation).toHaveBeenCalledWith("conv-new");
    expect(chatStore.isStreaming).toBe(true);

    // Simulate token chunks arriving
    streamCallbacks.onToken("Hello");
    streamCallbacks.onToken(" world!");

    const lastMsg = chatStore.currentConversation.messages[1];
    expect(lastMsg.content).toBe("Hello world!");

    // Simulate completion
    await streamCallbacks.onStatus("COMPLETED");

    expect(chatStore.isStreaming).toBe(false);
    expect(authStore.sdk.getConversations).toHaveBeenCalled();
  });

  it("should append message to existing conversation when sending message", async () => {
    const authStore = useAuthStore();
    const chatStore = useChatStore();

    chatStore.currentConversation = {
      id: "conv-existing",
      title: "Existing Conv",
      messages: [{ role: "USER", content: "Hi" }, { role: "ASSISTANT", content: "Hello" }],
    };

    const mockJobResult = { job_id: "job-456", conversation_id: "conv-existing" };
    let streamCallbacks: any = null;
    const cleanupMock = vi.fn();

    vi.spyOn(authStore.sdk, "createMessage").mockResolvedValue(mockJobResult as any);
    vi.spyOn(authStore.sdk, "connectJobStream").mockImplementation((jobId: string, callbacks: any) => {
      streamCallbacks = callbacks;
      return cleanupMock;
    });

    await chatStore.sendMessage("What is 2+2?");

    expect(chatStore.currentConversation.messages.length).toBe(4);
    expect(chatStore.currentConversation.messages[2]).toEqual({ role: "USER", content: "What is 2+2?" });
    expect(chatStore.currentConversation.messages[3]).toEqual({ role: "ASSISTANT", content: "" });

    streamCallbacks.onToken("4");
    expect(chatStore.currentConversation.messages[3].content).toBe("4");
  });

  it("should trigger cleanup of active stream when sending a new message", async () => {
    const authStore = useAuthStore();
    const chatStore = useChatStore();

    const previousCleanup = vi.fn();
    (chatStore as any).activeStreamCleanup = previousCleanup;

    vi.spyOn(authStore.sdk, "createMessage").mockResolvedValue({ job_id: "j2", conversation_id: "c2" } as any);
    vi.spyOn(authStore.sdk, "getConversation").mockResolvedValue({ id: "c2", messages: [] } as any);
    vi.spyOn(authStore.sdk, "connectJobStream").mockReturnValue(vi.fn());

    await chatStore.sendMessage("Second message");

    expect(previousCleanup).toHaveBeenCalled();
  });

  it("should handle error in streaming callback", async () => {
    const authStore = useAuthStore();
    const chatStore = useChatStore();

    let streamCallbacks: any = null;
    vi.spyOn(authStore.sdk, "createMessage").mockResolvedValue({ job_id: "j3", conversation_id: "c3" } as any);
    vi.spyOn(authStore.sdk, "getConversation").mockResolvedValue({ id: "c3", messages: [] } as any);
    vi.spyOn(authStore.sdk, "connectJobStream").mockImplementation((jobId: string, callbacks: any) => {
      streamCallbacks = callbacks;
      return vi.fn();
    });

    await chatStore.sendMessage("Test error stream");

    expect(chatStore.isStreaming).toBe(true);
    await streamCallbacks.onError(new Error("Network error"));
    expect(chatStore.isStreaming).toBe(false);
  });

  it("should trigger fallback HTTP polling after 6 seconds of inactivity", async () => {
    vi.useFakeTimers();
    const authStore = useAuthStore();
    const chatStore = useChatStore();

    const mockJobResult = { job_id: "job-timeout", conversation_id: "conv-timeout" };
    vi.spyOn(authStore.sdk, "createMessage").mockResolvedValue(mockJobResult as any);
    vi.spyOn(authStore.sdk, "getConversation").mockResolvedValue({ id: "conv-timeout", messages: [] } as any);
    vi.spyOn(authStore.sdk, "connectJobStream").mockReturnValue(vi.fn());

    await chatStore.sendMessage("Slow stream message");
    expect(chatStore.isStreaming).toBe(true);

    // Fast forward 6 seconds
    await vi.advanceTimersByTimeAsync(6500);

    expect(chatStore.isStreaming).toBe(false);
    expect(authStore.sdk.getConversation).toHaveBeenCalledWith("conv-timeout");
  });
});
