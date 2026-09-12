// ============================================================================
/**
 * Classe de base pour toutes les erreurs HTTP applicatives.
 */
// ============================================================================
export class HttpError extends Error {
	constructor(
		public statusCode: number,
		message: string,
		public details?: unknown,
	) {
		super(message);
		this.name = this.constructor.name;
		// Maintenir une stack trace propre en V8 (Node.js)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

// ============================================================================
/**
 * Erreur HTTP 401 (Non authentifié).
 */
// ============================================================================
export class UnauthorizedError extends HttpError {
	constructor(message = "Non authentifié") {
		super(401, message);
	}
}

// ============================================================================
/**
 * Erreur HTTP 403 (Accès interdit / Droits insuffisants).
 */
// ============================================================================
export class ForbiddenError extends HttpError {
	constructor(message = "Accès interdit") {
		super(403, message);
	}
}

// ============================================================================
/**
 * Erreur HTTP 422 (Données de requête non valides / Schéma Zod en échec).
 */
// ============================================================================
export class ValidationError extends HttpError {
	constructor(public issues: Array<{ path: string; message: string; code?: string }>) {
		super(422, "Erreur de validation", issues);
	}
}

// ============================================================================
/**
 * Erreur HTTP 404 (Ressource demandée introuvable).
 */
// ============================================================================
export class NotFoundError extends HttpError {
	constructor(message = "Ressource introuvable") {
		super(404, message);
	}
}

// ============================================================================
/**
 * Erreur HTTP 400 (Requête mal formée ou paramètre manquant).
 */
// ============================================================================
export class BadRequestError extends HttpError {
	constructor(message = "Requête invalide") {
		super(400, message);
	}
}
