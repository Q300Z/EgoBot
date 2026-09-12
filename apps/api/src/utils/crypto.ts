import { Blowfish } from "egoroof-blowfish";

// ============================================================================
/**
 * Chiffre une chaîne en Blowfish ECB PKCS7 et encode en Base64 URL-safe.
 */
// ============================================================================
export function encodeBlowfish(cle: string, marqueur: string, chaine: string): string {
	try {
		const bf = new Blowfish(cle, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5);
		const encodedBuffer = Buffer.from(bf.encode(chaine));
		const out = encodedBuffer.toString("base64");

		return marqueur + out.replace(/\//g, "s_s").replace(/=/g, "e_e");
	} catch (e) {
		console.error(e);

		return btoa(new TextEncoder().encode(chaine).reduce((s, b) => s + String.fromCharCode(b), ""));
	}
}

// ============================================================================
/**
 * Déchiffre une charge utile Blowfish ECB PKCS7 formatée avec marqueur.
 */
// ============================================================================
export function decodeBlowfish(cle: string, marqueur: string, chaine: string): string {
	if (chaine.startsWith(marqueur)) {
		chaine = chaine.substring(marqueur.length).replace(/s_s/g, "/").replace(/e_e/g, "=");

		try {
			const bf = new Blowfish(cle, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5);
			const decoded = bf.decode(Buffer.from(chaine, "base64"), Blowfish.TYPE.STRING);

			return decoded;
		} catch (e) {
			console.error(e);
		}
	}

	// Compatibilité avec le fallback Java
	return new TextDecoder().decode(Uint8Array.from(atob(chaine), (c) => c.charCodeAt(0)));
}
