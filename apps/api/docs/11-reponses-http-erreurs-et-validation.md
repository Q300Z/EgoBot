# 11. Réponses HTTP, Erreurs & Validation Zod

Toutes les réponses de l'API sont normalisées par `ApiResponseFactory` et les requêtes sont validées par `Zod` ([`src/utils/response.factory.ts`](file:///home/tboutin/Documents/AGELID/api/src/utils/response.factory.ts), [`src/middlewares/validation.middleware.ts`](file:///home/tboutin/Documents/AGELID/api/src/middlewares/validation.middleware.ts)).

---

## 📦 Format Standard des Réponses API

### 1. Réponse de Succès (JSON)

```json
{
	"message": "Opération réussie.",
	"data": {
		"id": "12345",
		"status": "COMPLETED"
	}
}
```

### 2. Réponse d'Erreur (JSON)

```json
{
	"error": "Paramètres invalides.",
	"details": [
		{
			"path": "body.prompt",
			"message": "Le prompt doit contenir au moins 1 caractère.",
			"code": "too_small"
		}
	]
}
```

---

## 🛠️ Utilisation de `ApiResponseFactory`

```typescript
import { ApiResponseFactory } from "../../utils";

// 200 OK
ApiResponseFactory.success(res, data, "Données récupérées.");

// 201 Created
ApiResponseFactory.created(res, createdItem, "Ressource créée.");

// 202 Accepted (asynchrone)
ApiResponseFactory.accepted(res, { jobId }, "Traitement planifié.");

// 204 No Content
ApiResponseFactory.noContent(res);

// 400 Bad Request
ApiResponseFactory.badRequest(res, "Paramètres invalides", details);

// 401 Unauthorized
ApiResponseFactory.unauthorized(res, "Token JWT manquant ou expiré.");

// 403 Forbidden
ApiResponseFactory.forbidden(res, "Accès réservé aux administrateurs.");

// 404 Not Found
ApiResponseFactory.notFound(res, "Discussion introuvable.");

// Gestionnaire d'erreur générique (pour les blocs catch des contrôleurs)
ApiResponseFactory.handleError(res, error, next, "Message de secours");
```

---

## 🚨 Hiérarchie des Classes d'Erreurs (`src/core/errors/`)

Le framework fournit des classes d'erreurs dérivées de `HttpError` permettant de propager des codes d'état précis :

```typescript
import {
	HttpError,
	BadRequestError, // 400
	UnauthorizedError, // 401
	ForbiddenError, // 403
	NotFoundError, // 404
	ValidationError, // 400 avec tableau d'issues Zod
	InternalServerError, // 500
} from "../../core/errors";

// Exemple de déclenchement dans un service métier :
if (!conversation) {
	throw new NotFoundError("La conversation demandée n'existe pas.");
}
```

---

## 🛡️ Middleware de Validation Zod (`validate`)

Le middleware `validate(schema)` valide de manière synchrone et combinée le `body`, les `params` et la `query` :

```typescript
import { validate, getValidatedData } from "../../middlewares";
import { z } from "zod";

// 1. Définition du schéma de la route
const UpdateMessageSchema = z.object({
	params: z.object({ id: z.string().uuid() }),
	body: z.object({ content: z.string().min(1) }),
});

// 2. Application sur la route Express
router.patch("/messages/:id", validate(UpdateMessageSchema), (req, res) => {
	// 3. Extraction typée à 100% sans cast manuel
	const { params, body } = getValidatedData<z.infer<typeof UpdateMessageSchema>>(req);
	// params.id et body.content sont strictement typés
});
```
