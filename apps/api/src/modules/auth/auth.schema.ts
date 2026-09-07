import { z } from "zod";

// --- Enums & Schémas de base ---
export const ModelEnum = z.enum(["CHATBOT", "STATISTIQUE", "OBJ_TRV_PERDU"], {
	message: "Le modèle Egobot est invalide",
});

export const EgobotConfigSchema = z.object({
	url: z.string({ message: "L'URL de Egobot est invalide" }).trim(),
	model: ModelEnum,
	email: z.email({ message: "L'email de l'utilisateur est requis" }).trim(),
	user: z.string({ message: "Le user_id de l'utilisateur est requis" }).trim(),
	client: z.string({ message: "Le client_id de l'utilisateur est requis" }).trim(),
	db_key: z.string({ message: "La clé de base de données Egobot est requise" }).trim(),
	dev: z.string({ message: "Le mode développement est requis" }).trim(),
	token: z.string().optional(),
});

export const ClassicLoginSchema = z
	.object({
		email: z.string().trim().optional(),
		username: z.string().trim().optional(),
		emailOrUsername: z.string().trim().optional(),
		password: z.string().min(1, { message: "Le mot de passe est requis" }),
	})
	.refine((data) => Boolean(data.email || data.username || data.emailOrUsername), {
		message: "L'identifiant (email ou nom d'utilisateur) est requis",
	});

export const RegisterBodySchema = z.object({
	email: z.string().email({ message: "L'adresse email est invalide" }).trim(),
	password: z.string().min(6, { message: "Le mot de passe doit comporter au moins 6 caractères" }),
	username: z.string().trim().min(2, { message: "Le nom d'utilisateur doit comporter au moins 2 caractères" }).optional(),
	role: z.enum(["USER", "ADMIN"]).or(z.string()).optional().default("USER"),
});

export const RegisterRequestSchema = z.object({
	body: RegisterBodySchema,
});

export const LoginRequestBodySchema = ClassicLoginSchema;

export const LoginRequestSchema = z.object({
	body: LoginRequestBodySchema,
});

export const UserProfileSchema = z.object({
	id: z.string(),
	email: z.string(),
	username: z.string().nullable().optional(),
	role: z.string().default("USER"),
	created_at: z.date().or(z.string()).optional(),
	updated_at: z.date().or(z.string()).optional(),
});

export const LoginResponseSchema = z.object({
	token: z.string(),
	user: z.object({
		id: z.string().optional(),
		email: z.string(),
		username: z.string().nullable().optional(),
		role: z.string().optional(),
		dev: z.string().trim().optional(),
	}),
});

export const UserPayloadSchema = z.object({
	id: z.string(),
	client_id: z.string().optional().default("default"),
	email: z.string(),
	role: z.enum(["USER", "ADMIN"]).or(z.string()).default("USER"),
	dev: z.string().optional().default("false"),
});

// Types TypeScript inférés
export type Model = z.infer<typeof ModelEnum>;
export type EgobotConfig = z.infer<typeof EgobotConfigSchema>;
export type ClassicLoginInput = z.infer<typeof ClassicLoginSchema>;
export type RegisterInput = z.input<typeof RegisterBodySchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserPayload = z.infer<typeof UserPayloadSchema>;

