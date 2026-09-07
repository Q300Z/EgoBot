export interface ParsedErrorDetail {
  field?: string;
  message: string;
}

export interface ParsedError {
  title: string;
  message: string;
  explanation: string;
  statusCode?: number;
  details?: ParsedErrorDetail[];
  actionText?: string;
  actionType?: "reconnect" | "retry" | "refresh";
  raw?: unknown;
}

/**
 * Analyse une erreur frontend ou HTTP et la traduit en explications
 * claires, précises et actionnables pour l'utilisateur.
 */
export function parseApiError(error: unknown): ParsedError {
  const anyErr = error as any;

  // 1. Erreurs réseau (pas de réponse du serveur ou serveur éteint)
  if (
    anyErr?.code === "ERR_NETWORK" ||
    anyErr?.message === "Network Error" ||
    (anyErr?.isAxiosError && !anyErr?.response)
  ) {
    return {
      title: "Connexion impossible au serveur",
      message: "Impossible de joindre le serveur API.",
      explanation:
        "Vérifiez votre connexion réseau et assurez-vous que l'API est bien démarrée (port 8000).",
      actionText: "Réessayer",
      actionType: "retry",
      raw: error,
    };
  }

  // 2. Erreur de délai d'attente (Timeout)
  if (anyErr?.code === "ECONNABORTED" || anyErr?.message?.includes("timeout")) {
    return {
      title: "Délai d'attente dépassé",
      message: "Le serveur a mis trop de temps à répondre.",
      explanation:
        "La requête a dépassé le temps alloué. Le service peut être surchargé, veuillez patienter quelques instants.",
      actionText: "Réessayer",
      actionType: "retry",
      raw: error,
    };
  }

  const response = anyErr?.response;
  const status: number | undefined = response?.status;
  const data = response?.data;

  // 3. Erreur 401 : Session expirée ou invalide
  if (status === 401) {
    return {
      title: "Session expirée",
      message: "Vous n'êtes plus authentifié.",
      explanation:
        "Votre jeton de connexion est expiré ou invalide. Pour votre sécurité, veuillez vous reconnecter.",
      statusCode: 401,
      actionText: "Se reconnecter",
      actionType: "reconnect",
      raw: error,
    };
  }

  // 4. Erreur 403 : Accès interdit
  if (status === 403) {
    return {
      title: "Accès refusé",
      message: data?.error || "Droits d'accès insuffisants.",
      explanation:
        "Votre compte ne dispose pas des privilèges nécessaires pour exécuter cette action.",
      statusCode: 403,
      raw: error,
    };
  }

  // 5. Erreur 404 : Ressource introuvable
  if (status === 404) {
    return {
      title: "Élément introuvable",
      message: data?.error || "La ressource demandée n'existe pas.",
      explanation:
        "La conversation ou les données que vous tentez de consulter ont peut-être été supprimées ou déplacées.",
      statusCode: 404,
      actionText: "Actualiser",
      actionType: "refresh",
      raw: error,
    };
  }

  // 6. Erreur 422 : Données invalides (Zod Validation)
  if (status === 422) {
    const rawDetails = data?.details;
    const details: ParsedErrorDetail[] = [];

    if (Array.isArray(rawDetails)) {
      for (const item of rawDetails) {
        let fieldName = item.path || "";
        if (fieldName.startsWith("body.")) fieldName = fieldName.slice(5);

        let friendlyMsg = item.message;
        if (fieldName === "email") {
          friendlyMsg = "L'adresse email saisie n'est pas au format valide (ex: utilisateur@domaine.com).";
        } else if (fieldName === "password") {
          friendlyMsg = "Le mot de passe doit comporter au moins 6 caractères.";
        } else if (fieldName === "username") {
          friendlyMsg = "Le nom d'utilisateur doit comporter au moins 2 caractères.";
        }

        details.push({
          field: fieldName,
          message: friendlyMsg,
        });
      }
    }

    const explanation =
      details.length > 0
        ? details.map((d) => `• ${d.message}`).join("\n")
        : "Vérifiez que tous les champs obligatoires sont complétés correctement.";

    return {
      title: "Erreur de validation",
      message: data?.error || "Certaines données saisies ne sont pas conformes.",
      explanation,
      statusCode: 422,
      details,
      raw: error,
    };
  }

  // 7. Erreur 400 : Mauvaise requête (Bad Request)
  if (status === 400) {
    const rawMsg = data?.error || anyErr?.message || "Requête invalide.";
    let explanation = "La requête envoyée au serveur comporte des paramètres incompatibles.";

    if (rawMsg.includes("Configuration client") || rawMsg.includes("Egobot")) {
      explanation =
        "Votre configuration utilisateur était momentanément introuvable dans le cache. Veuillez vous reconnecter pour rafraîchir vos paramètres.";
    }

    return {
      title: "Requête invalide",
      message: rawMsg,
      explanation,
      statusCode: 400,
      raw: error,
    };
  }

  // 8. Erreur 503 : Service indisponible (ex: Valkey en panne, Circuit Breaker)
  if (status === 503) {
    return {
      title: "Service momentanément indisponible",
      message: data?.error || "Le service est temporairement inaccessible.",
      explanation:
        "L'infrastructure de traitement (Valkey ou moteur d'inférence) subit une panne ou une surcharge momentanée. Le circuit de sécurité protège le serveur. Veuillez patienter une trentaine de secondes avant de réessayer.",
      statusCode: 503,
      actionText: "Réessayer",
      actionType: "retry",
      raw: error,
    };
  }

  // 9. Erreur 500 : Erreur interne serveur
  if (status && status >= 500) {
    return {
      title: "Erreur interne du serveur",
      message: data?.error || "Un problème inattendu est survenu.",
      explanation:
        "Le serveur a rencontré une erreur interne lors du traitement de votre demande. Si l'anomalie persiste, veuillez contacter l'administrateur système.",
      statusCode: status,
      raw: error,
    };
  }

  // 10. Erreur générique
  const fallbackMessage =
    data?.error || data?.message || anyErr?.message || (typeof error === "string" ? error : "Une erreur inattendue est survenue.");

  return {
    title: "Erreur",
    message: fallbackMessage,
    explanation: "Une anomalie s'est produite lors de l'exécution de l'opération.",
    statusCode: status,
    raw: error,
  };
}
