import type { LogisticsPrismaClient } from "../database/index.js";
import {
  authenticatedCustomerSchema,
  type AuthenticatedCustomer,
} from "../dtos/index.js";

export interface CustomerIdentityInput {
  customerId?: string | null;
  email?: string | null;
}

export type CustomerResolution =
  | { resolved: true; customer: AuthenticatedCustomer }
  | {
      resolved: false;
      reason: "NO_IDENTITY" | "NOT_FOUND" | "INACTIVE";
      message: string;
    };

/**
 * Résout l'identité logistique d'un client.
 *
 * L'authentification (User, SQLite `apps/api`) et le métier (Customer,
 * PostgreSQL) vivent dans deux bases distinctes : aucune clé étrangère ne
 * peut les relier, la correspondance se fait donc ici, en code.
 */
export class CustomerQueryService {
  constructor(private readonly prisma: LogisticsPrismaClient) {}

  async resolve(input: CustomerIdentityInput): Promise<CustomerResolution> {
    const customerId = input.customerId?.trim();
    const email = input.email?.trim().toLowerCase();

    // 1. Aucune identité exploitable.
    if (!customerId && !email) {
      return {
        resolved: false,
        reason: "NO_IDENTITY",
        message:
          "Impossible de vous identifier : aucune information de compte n'a été fournie.",
      };
    }

    const select = { id: true, email: true, isActive: true } as const;

    // 2. Le rattachement explicite fait autorité.
    let customer = customerId
      ? await this.prisma.customer.findUnique({
          where: { id: customerId },
          select,
        })
      : null;

    // 3. Repli sur l'email normalisé tant que le rattachement explicite
    //    n'est pas renseigné (ou ne correspond à rien).
    if (!customer && email) {
      customer = await this.prisma.customer.findUnique({
        where: { email },
        select,
      });
    }

    // 5. Aucun dossier trouvé.
    if (!customer) {
      return {
        resolved: false,
        reason: "NOT_FOUND",
        message: "Aucun compte client ne correspond à vos informations.",
      };
    }

    // 4. Dossier conservé pour l'historique, mais plus consultable.
    if (!customer.isActive) {
      return {
        resolved: false,
        reason: "INACTIVE",
        message:
          "Votre compte client n'est plus actif. Contactez le service client pour toute question.",
      };
    }

    // 6. `createLogisticsTools` refera ce parse : autant échouer ici avec
    //    un message exploitable si la forme stockée est invalide.
    const parsed = authenticatedCustomerSchema.safeParse({
      customerId: customer.id,
      email: customer.email,
    });
    if (!parsed.success) {
      return {
        resolved: false,
        reason: "NOT_FOUND",
        message: "Aucun compte client ne correspond à vos informations.",
      };
    }

    return { resolved: true, customer: parsed.data };
  }
}
