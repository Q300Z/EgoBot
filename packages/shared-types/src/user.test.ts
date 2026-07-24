import { describe, it, expect } from "vitest";
import {
  RoleSchema,
  UserSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  AuthResponseSchema,
} from "./user.js";

describe("User Schemas", () => {
  describe("RoleSchema", () => {
    it("should accept valid roles", () => {
      expect(RoleSchema.parse("USER")).toBe("USER");
      expect(RoleSchema.parse("ADMIN")).toBe("ADMIN");
    });

    it("should reject invalid roles", () => {
      expect(() => RoleSchema.parse("SUPERADMIN")).toThrow();
      expect(() => RoleSchema.parse(123)).toThrow();
      expect(() => RoleSchema.parse(null)).toThrow();
    });
  });

  describe("UserSchema", () => {
    const validUser = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      email: "test@example.com",
      role: "USER" as const,
      created_at: "2026-07-23T10:00:00.000Z",
      updated_at: "2026-07-23T10:00:00.000Z",
    };

    it("should parse a valid user object", () => {
      const result = UserSchema.parse(validUser);
      expect(result).toEqual(validUser);
    });

    it("should reject an invalid uuid", () => {
      expect(() =>
        UserSchema.parse({ ...validUser, id: "invalid-uuid" })
      ).toThrow();
    });

    it("should reject an invalid email format", () => {
      expect(() =>
        UserSchema.parse({ ...validUser, email: "invalid-email" })
      ).toThrow();
    });

    it("should reject an invalid role", () => {
      expect(() =>
        UserSchema.parse({ ...validUser, role: "GUEST" })
      ).toThrow();
    });

    it("should reject invalid ISO datetimes", () => {
      expect(() =>
        UserSchema.parse({ ...validUser, created_at: "2026-07-23" })
      ).toThrow();
    });

    it("should reject missing required fields", () => {
      const { email, ...incompleteUser } = validUser;
      expect(() => UserSchema.parse(incompleteUser)).toThrow();
    });
  });

  describe("LoginRequestSchema", () => {
    it("should validate correct login credentials", () => {
      const payload = {
        email: "user@domain.com",
        password: "secretpassword",
      };
      expect(LoginRequestSchema.parse(payload)).toEqual(payload);
    });

    it("should reject invalid email", () => {
      expect(() =>
        LoginRequestSchema.parse({ email: "bademail", password: "secretpassword" })
      ).toThrow();
    });

    it("should reject passwords shorter than 6 characters", () => {
      expect(() =>
        LoginRequestSchema.parse({ email: "user@domain.com", password: "123" })
      ).toThrow();
    });
  });

  describe("RegisterRequestSchema", () => {
    it("should validate registration without role", () => {
      const payload = {
        email: "newuser@domain.com",
        password: "securepassword",
      };
      expect(RegisterRequestSchema.parse(payload)).toEqual(payload);
    });

    it("should validate registration with role", () => {
      const payload = {
        email: "adminuser@domain.com",
        password: "securepassword",
        role: "ADMIN" as const,
      };
      expect(RegisterRequestSchema.parse(payload)).toEqual(payload);
    });

    it("should reject invalid registration payload", () => {
      expect(() =>
        RegisterRequestSchema.parse({
          email: "not-an-email",
          password: "123",
          role: "SUPERADMIN",
        })
      ).toThrow();
    });
  });

  describe("AuthResponseSchema", () => {
    it("should validate AuthResponse structure", () => {
      const payload = {
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        user: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          email: "user@domain.com",
          role: "USER" as const,
          created_at: "2026-07-23T10:00:00.000Z",
          updated_at: "2026-07-23T10:00:00.000Z",
        },
      };
      expect(AuthResponseSchema.parse(payload)).toEqual(payload);
    });

    it("should reject invalid token or user", () => {
      expect(() =>
        AuthResponseSchema.parse({ token: 123, user: {} })
      ).toThrow();
    });
  });
});
