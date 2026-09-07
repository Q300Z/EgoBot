import { z } from "zod";

export const RoleSchema = z.enum(["USER", "ADMIN"]);
export type Role = z.infer<typeof RoleSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: RoleSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// Pas de champ `role` : l'inscription est publique, l'accepter depuis le client
// permettrait de se créer un compte administrateur. La création d'un compte
// privilégié passe par les routes /api/v1/admin/users, protégées par requireAdmin.
export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
