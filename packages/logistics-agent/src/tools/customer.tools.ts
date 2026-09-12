import { tool } from "langchain";
import { z } from "zod";
import type { AuthenticatedCustomer } from "../dtos/index.js";
import type { CustomerService } from "../services/index.js";

const emptyCustomerInputSchema = z.object({});

/**
 * Crée les outils LangChain relatifs à l'identité et au profil du client connecté.
 *
 * Ces outils n'exposent aucun paramètre d'identité au LLM : le `customerId` est automatiquement
 * injecté depuis la session serveur pour garantir un cloisonnement strict entre utilisateurs.
 *
 * @param customer - Informations du client authentifié.
 * @param customerService - Service métier de gestion des clients.
 * @returns Tuple contenant les outils `get_customer_profile`, `get_customer_identity` et `get_customer_current_address`.
 */
export function createCustomerTools(
  customer: AuthenticatedCustomer,
  customerService: CustomerService,
) {
  const getCustomerProfile = tool(
    () => customerService.findProfileSummary(customer.customerId),
    {
      name: "get_customer_profile",
      description:
        "Consulte le profil du client authentifié : numéro client, identité, coordonnées, état du compte et adresse courante.",
      schema: emptyCustomerInputSchema,
    },
  );

  const getCustomerIdentity = tool(
    () => customerService.getIdentity(customer.customerId),
    {
      name: "get_customer_identity",
      description:
        "Consulte le numéro client et l'identité du client authentifié.",
      schema: emptyCustomerInputSchema,
    },
  );

  const getCustomerCurrentAddress = tool(
    () => customerService.getCurrentAddress(customer.customerId),
    {
      name: "get_customer_current_address",
      description:
        "Consulte l'adresse courante du client authentifié, si elle existe.",
      schema: emptyCustomerInputSchema,
    },
  );

  return [
    getCustomerProfile,
    getCustomerIdentity,
    getCustomerCurrentAddress,
  ] as const;
}
