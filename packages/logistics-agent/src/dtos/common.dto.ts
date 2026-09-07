import { z } from "zod";

export const authenticatedCustomerSchema = z.object({
  customerId: z.uuid(),
  email: z.email(),
});

export type AuthenticatedCustomer = z.infer<
  typeof authenticatedCustomerSchema
>;

export const notFoundResultSchema = z.object({
  found: z.literal(false),
  code: z.literal("NOT_FOUND"),
  message: z.string(),
});

export type NotFoundResultDto = z.infer<typeof notFoundResultSchema>;

export const nullableDateTimeSchema = z.string().nullable();

export const moneySchema = z.string().describe(
  "Montant décimal sérialisé en chaîne afin de préserver sa précision.",
);

export function notFound(message: string): NotFoundResultDto {
  return {
    found: false,
    code: "NOT_FOUND",
    message,
  };
}
