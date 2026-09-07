/**
 * Configuration Multer pour les uploads entrants.
 * Le module fixe le stockage, les limites et les filtres de fichiers.
 */
import type { FileFilterCallback, StorageEngine } from "multer";
import multer from "multer";
import type { Request, RequestHandler } from "express";

// Configuration du stockage
const storage: StorageEngine = multer.diskStorage({
	destination: "./uploads/",
	filename: (_req: Request, file: Express.Multer.File, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
		cb(null, `${uniqueSuffix}-${file.originalname}`);
	},
});

// Filtrage des fichiers (par exemple, uniquement les images)
const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
	if (file.mimetype.startsWith("image/")) {
		cb(null, true);
	} else {
		cb(new Error("Seuls les fichiers d'image sont autorisés."));
	}
};

// Configuration de Multer
const upload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 }, // Limite de taille (5 Mo)
	fileFilter,
});

// ============================================================================
/**
 * Middleware d'upload d'un fichier image unique (champ 'image', max 5 Mo).
 */
// ============================================================================
export const uploadSingleFile: RequestHandler = upload.single("image");

// ============================================================================
/**
 * Middleware d'upload de multiples fichiers images (champ 'images', max 10 fichiers).
 */
// ============================================================================
export const uploadMultipleFiles: RequestHandler = upload.array("images", 10);
