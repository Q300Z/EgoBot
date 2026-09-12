import { describe, it, expect } from "vitest";
import { encodeBlowfish, decodeBlowfish } from "../../utils/crypto";

describe("Crypto Utils - Blowfish", () => {
	const secretKey = "IA@gelid2026";
	const marker = "BLOWFISH_PREFIX:";

	it("devrait chiffrer et déchiffrer une chaîne avec succès (aller-retour)", () => {
		const originalText = JSON.stringify({
			email: "user@agelid.com",
			url: "https://api.agelid.com",
			model: "CHATBOT",
		});

		const encrypted = encodeBlowfish(secretKey, marker, originalText);
		expect(encrypted.startsWith(marker)).toBe(true);
		expect(encrypted).not.toBe(originalText);

		const decrypted = decodeBlowfish(secretKey, marker, encrypted);
		expect(decrypted).toBe(originalText);
	});

	it("devrait gérer le décodage sans marqueur avec le fallback", () => {
		const plain = "Hello World";
		const base64Plain = Buffer.from(plain).toString("base64");

		const result = decodeBlowfish(secretKey, marker, base64Plain);
		expect(result).toBe(plain);
	});

	it("devrait encoder et décoder des caractères spéciaux et UTF-8", () => {
		const utf8Text = "Données sécurisées avec accents éèàç et emojis 🚀🔒";
		const encrypted = encodeBlowfish(secretKey, "", utf8Text);
		const decrypted = decodeBlowfish(secretKey, "", encrypted);

		expect(decrypted).toBe(utf8Text);
	});
});
