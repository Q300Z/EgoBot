import { describe, it, expect } from "vitest";
import {
  MessageRoleSchema,
  MessageSchema,
  ConversationSchema,
  CreateMessageRequestSchema,
} from "./conversation.js";

describe("Conversation Schemas", () => {
  describe("MessageRoleSchema", () => {
    it("should accept valid message roles", () => {
      expect(MessageRoleSchema.parse("USER")).toBe("USER");
      expect(MessageRoleSchema.parse("ASSISTANT")).toBe("ASSISTANT");
    });

    it("should reject invalid message roles", () => {
      expect(() => MessageRoleSchema.parse("SYSTEM")).toThrow();
      expect(() => MessageRoleSchema.parse("BOT")).toThrow();
    });
  });

  describe("MessageSchema", () => {
    const validMessage = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      conversation_id: "223e4567-e89b-12d3-a456-426614174000",
      role: "USER" as const,
      content: "Hello, world!",
      created_at: "2026-07-23T10:00:00.000Z",
      updated_at: "2026-07-23T10:00:00.000Z",
    };

    it("should parse a valid message object", () => {
      expect(MessageSchema.parse(validMessage)).toEqual(validMessage);
    });

    it("should reject invalid conversation_id UUID", () => {
      expect(() =>
        MessageSchema.parse({ ...validMessage, conversation_id: "not-a-uuid" })
      ).toThrow();
    });

    it("should reject invalid content type", () => {
      expect(() =>
        MessageSchema.parse({ ...validMessage, content: 123 })
      ).toThrow();
    });
  });

  describe("ConversationSchema", () => {
    const validConversation = {
      id: "323e4567-e89b-12d3-a456-426614174000",
      user_id: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test Conversation",
      model: "gpt-4o",
      created_at: "2026-07-23T10:00:00.000Z",
      updated_at: "2026-07-23T10:00:00.000Z",
    };

    it("should parse a minimal valid conversation", () => {
      expect(ConversationSchema.parse(validConversation)).toEqual(validConversation);
    });

    it("should parse conversation with nullable deleted_at and messages array", () => {
      const fullConversation = {
        ...validConversation,
        deleted_at: null,
        messages: [
          {
            id: "123e4567-e89b-12d3-a456-426614174000",
            conversation_id: "323e4567-e89b-12d3-a456-426614174000",
            role: "USER" as const,
            content: "Hello",
            created_at: "2026-07-23T10:00:00.000Z",
            updated_at: "2026-07-23T10:00:00.000Z",
          },
        ],
      };
      expect(ConversationSchema.parse(fullConversation)).toEqual(fullConversation);
    });

    it("should accept valid datetime for deleted_at", () => {
      const deletedConv = {
        ...validConversation,
        deleted_at: "2026-07-23T11:00:00.000Z",
      };
      expect(ConversationSchema.parse(deletedConv)).toEqual(deletedConv);
    });

    it("should reject invalid user_id", () => {
      expect(() =>
        ConversationSchema.parse({ ...validConversation, user_id: "bad-id" })
      ).toThrow();
    });
  });

  describe("CreateMessageRequestSchema", () => {
    it("should parse prompt-only request", () => {
      const req = { prompt: "Explain quantum mechanics" };
      expect(CreateMessageRequestSchema.parse(req)).toEqual(req);
    });

    it("should parse request with optional conversation_id and model", () => {
      const req = {
        prompt: "Explain quantum mechanics",
        conversation_id: "323e4567-e89b-12d3-a456-426614174000",
        model: "claude-3-5-sonnet",
      };
      expect(CreateMessageRequestSchema.parse(req)).toEqual(req);
    });

    it("should reject empty prompt string", () => {
      expect(() =>
        CreateMessageRequestSchema.parse({ prompt: "" })
      ).toThrow();
    });

    it("should reject invalid conversation_id format", () => {
      expect(() =>
        CreateMessageRequestSchema.parse({
          prompt: "Hello",
          conversation_id: "invalid-uuid",
        })
      ).toThrow();
    });
  });
});
