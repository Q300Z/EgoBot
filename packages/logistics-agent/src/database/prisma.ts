import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/prisma/client.js";

export function createPrismaClient(
  connectionString = process.env.DATABASE_URL,
): PrismaClient {
  if (!connectionString)
    throw new Error(
      "DATABASE_URL est requis pour créer le client Prisma logistique.",
    );

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

export type LogisticsPrismaClient = PrismaClient;
