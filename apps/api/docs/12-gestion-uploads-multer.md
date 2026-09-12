# 12. Gestion des Uploads de Fichiers (Multer)

L'API fournit une configuration standardisée pour le traitement des téléversements de fichiers via **Multer** ([`src/middlewares/multer.middleware.ts`](file:///home/tboutin/Documents/AGELID/api/src/middlewares/multer.middleware.ts)).

---

## ⚙️ Configuration & Sécurité des Uploads

- **Répertoire de destination** : `./uploads/`
- **Génération de nom unique** : `${timestamp}-${random}-${originalname}`
- **Limite de taille maximale** : **5 Mo** (`5 * 1024 * 1024` octets).
- **Filtrage MIME** : Validation stricte des fichiers d'images (`image/*`). Les autres types de fichiers lèvent une erreur explicite.

---

## 🛠️ Utilisation dans les Routes Express

Le middleware exporte deux gestionnaires prêts à l'emploi :

### 1. Upload d'une Image Unique (`uploadSingleFile`)

Attache le fichier uploadé sous le champ de formulaire `image` sur `req.file` :

```typescript
import { Router } from "express";
import { uploadSingleFile } from "../../middlewares";
import { ApiResponseFactory } from "../../utils";

const router = Router();

router.post("/avatar", uploadSingleFile, (req, res) => {
	if (!req.file) {
		return ApiResponseFactory.badRequest(res, "Aucun fichier image n'a été fourni.");
	}

	const filePath = req.file.path;
	const fileName = req.file.filename;

	ApiResponseFactory.created(res, { path: filePath, name: fileName }, "Image enregistrée avec succès.");
});
```

---

### 2. Upload de Plusieurs Images (`uploadMultipleFiles`)

Autorise le téléversement de jusqu'à **5 images simultanées** sous le champ de formulaire `images` sur `req.files` :

```typescript
import { uploadMultipleFiles } from "../../middlewares";

router.post("/gallery", uploadMultipleFiles, (req, res) => {
	const files = req.files as Express.Multer.File[];
	// files contient la liste des 1 à 5 images enregistrées sur disque
	ApiResponseFactory.created(res, { count: files.length }, "Images enregistrées.");
});
```
