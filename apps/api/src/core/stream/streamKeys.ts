// ============================================================================
/**
 * Fabrique centralisée des clés de flux et de verrous Redis.
 */
// ============================================================================
export const StreamKeys = {
	// ============================================================================
	/**
	 * Clé de file de requêtes pour les workers : jobs:queue:<env>:<workerType>.
	 */
	// ============================================================================
	queue: (env: "dev" | "prod" | string, workerType: string) => `jobs:queue:${env}:${workerType}`,

	// ============================================================================
	/**
	 * Clé de flux de réponse / événement pour une entité : jobs:sse:<env>:<entityId>.
	 */
	// ============================================================================
	sse: (env: "dev" | "prod" | string, entityId: string) => `jobs:sse:${env}:${entityId}`,

	// ============================================================================
	/**
	 * Clé de stockage temporaire de l'environnement d'une entité (TTL 12h) : job:env:<entityId>.
	 */
	// ============================================================================
	jobEnv: (entityId: string) => `job:env:${entityId}`,

	// ============================================================================
	/**
	 * Clé de signal d'annulation temporaire : job:cancel:<entityId>.
	 */
	// ============================================================================
	cancel: (entityId: string) => `job:cancel:${entityId}`,
};
