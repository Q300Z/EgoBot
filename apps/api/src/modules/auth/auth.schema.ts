import { z } from "zod";

// --- Enums & Schémas de base ---
export const ModelEnum = z.enum(["CHATBOT", "LOGISTICS"], {
	message: "Le modèle Egobot est invalide",
});

export const EgobotConfigSchema = z
	.object({
		url: z.string({ message: "L'URL de Egobot est invalide" }).trim(),
		model: ModelEnum,
		email: z.string({ message: "L'email de l'utilisateur est requis" }).email({ message: "L'email de l'utilisateur est invalide" }).trim(),
		user: z.string({ message: "Le user_id de l'utilisateur est requis" }).trim(),
		client: z.string().optional(),
		db_key: z.string().optional(),
		dev: z.string().optional(),
		token: z.string().optional(),
	})
	.passthrough();

export const ClassicLoginSchema = z
	.object({
		email: z.string().trim().optional(),
		username: z.string().trim().optional(),
		emailOrUsername: z.string().trim().optional(),
		password: z.string().min(1, { message: "Le mot de passe est requis" }),
	})
	.refine(
		(data) => {
			const emailVal = data.email?.trim();
			const userVal = data.username?.trim();
			const euVal = data.emailOrUsername?.trim();
			return Boolean(emailVal || userVal || euVal);
		},
		{
			message: "L'identifiant (email ou nom d'utilisateur) est requis",
		},
	);

export const RegisterBodySchema = z.object({
	email: z
		.string({ message: "L'adresse email est requise" })
		.email({ message: "L'adresse email est invalide" })
		.trim()
		.toLowerCase(),
	password: z
		.string({ message: "Le mot de passe est requis" })
		.min(6, { message: "Le mot de passe doit comporter au moins 6 caractères" })
		.max(128, { message: "Le mot de passe ne peut pas dépasser 128 caractères" }),
	username: z
		.string()
		.trim()
		.min(2, { message: "Le nom d'utilisateur doit comporter au moins 2 caractères" })
		.max(50, { message: "Le nom d'utilisateur ne peut pas dépasser 50 caractères" })
		.optional(),
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
	dev: z.string().optional(),
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
