import type {
  Address,
  Customer,
} from "../../prisma/generated/prisma/client.js";
import type { LogisticsPrismaClient } from "../database/index.js";
import {
  customerAddressResultSchema,
  customerIdentityResultSchema,
  customerResultSchema,
  notFound,
  type CustomerAddressResultDto,
  type CustomerIdentityResultDto,
  type CustomerResultDto,
} from "../dtos/index.js";
import { toIsoString } from "./serialization.js";

function mapAddress(address: Address | null) {
  if (!address) return null;

  return {
    id: address.id,
    status: address.status,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    postalCode: address.postalCode,
    city: address.city,
    stateOrProvince: address.stateOrProvince,
    countryCode: address.countryCode,
    lockedAt: toIsoString(address.lockedAt),
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}

function mapCustomer(
  customer: Customer & { currentAddress: Address | null },
) {
  return {
    id: customer.id,
    customerNumber: customer.customerNumber,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    isActive: customer.isActive,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    currentAddress: mapAddress(customer.currentAddress),
  };
}

/**
 * Service métier Customer en lecture seule.
 */
export class CustomerService {
  constructor(private readonly prisma: LogisticsPrismaClient) {}

  // Recherches générales

  async findById(customerId: string): Promise<CustomerResultDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { currentAddress: true },
    });

    return this.toResult(customer);
  }

  async findByCustomerNumber(
    customerNumber: string,
  ): Promise<CustomerResultDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { customerNumber: customerNumber.trim() },
      include: { currentAddress: true },
    });

    return this.toResult(customer);
  }

  async findByEmail(email: string): Promise<CustomerResultDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { currentAddress: true },
    });

    return this.toResult(customer);
  }

  // Lectures ciblées du client authentifié

  async getIdentity(customerId: string): Promise<CustomerIdentityResultDto> {
    const identity = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        customerNumber: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!identity) return notFound("Client introuvable.");

    return customerIdentityResultSchema.parse({
      found: true,
      identity,
    });
  }

  async getCurrentAddress(
    customerId: string,
  ): Promise<CustomerAddressResultDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { currentAddress: true },
    });

    if (!customer) return notFound("Client introuvable.");

    return customerAddressResultSchema.parse({
      found: true,
      address: mapAddress(customer.currentAddress),
    });
  }

  private toResult(
    customer:
      | (Customer & { currentAddress: Address | null })
      | null,
  ): CustomerResultDto {
    if (!customer) return notFound("Client introuvable.");

    return customerResultSchema.parse({
      found: true,
      customer: mapCustomer(customer),
    });
  }
}
