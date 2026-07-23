import { z } from "zod";
import {
  notFoundResultSchema,
  nullableDateTimeSchema,
} from "./common.dto.js";

export const addressStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "LOCKED",
  "ARCHIVED",
]);

export const customerAddressSchema = z.object({
  id: z.uuid(),
  status: addressStatusSchema,
  label: z.string().nullable(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  stateOrProvince: z.string().nullable(),
  countryCode: z.string().length(2),
  lockedAt: nullableDateTimeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const customerIdentitySchema = z.object({
  id: z.uuid(),
  customerNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});

export const customerContactSchema = z.object({
  email: z.email(),
  phone: z.string().nullable(),
});

export const customerAccountStatusSchema = z.object({
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const customerSchema = customerIdentitySchema
  .extend(customerContactSchema.shape)
  .extend(customerAccountStatusSchema.shape)
  .extend({
    currentAddress: customerAddressSchema.nullable(),
  });

export const customerResultSchema = z.union([
  z.object({
    found: z.literal(true),
    customer: customerSchema,
  }),
  notFoundResultSchema,
]);

export const customerIdentityResultSchema = z.union([
  z.object({
    found: z.literal(true),
    identity: customerIdentitySchema,
  }),
  notFoundResultSchema,
]);

export const customerAddressResultSchema = z.union([
  z.object({
    found: z.literal(true),
    address: customerAddressSchema.nullable(),
  }),
  notFoundResultSchema,
]);

export type CustomerAddressDto = z.infer<
  typeof customerAddressSchema
>;
export type CustomerIdentityDto = z.infer<
  typeof customerIdentitySchema
>;
export type CustomerContactDto = z.infer<
  typeof customerContactSchema
>;
export type CustomerAccountStatusDto = z.infer<
  typeof customerAccountStatusSchema
>;
export type CustomerDto = z.infer<typeof customerSchema>;
export type CustomerResultDto = z.infer<typeof customerResultSchema>;
export type CustomerIdentityResultDto = z.infer<
  typeof customerIdentityResultSchema
>;
export type CustomerAddressResultDto = z.infer<
  typeof customerAddressResultSchema
>;
