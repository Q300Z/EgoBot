import { describe, it, expect, vi, beforeEach } from "vitest";
import { eventBus } from "../../../core/bus";
import { DemandeController } from "../../../modules/gv/demande/demandeController";
import { DemandeService } from "../../../modules/gv/demande/demandeService";
import { DemandeEvents } from "../../../modules/gv/demande/demande.events";
import { redisWriter } from "../../../config/redis";
import type { Request, Response as ExpressResponse } from "express";

describe("GV Demande Module", () => {
	const validDemande = {
		uid: "demande-123",
		carte: {
			nbVehicules: 1,
			nbMaxVehicules: 2,
			valide: true,
			complete: true,
			nom: "Carte Pro",
		},
		documents: [
			{
				image: true,
				sType: "CARTE_GRISE",
				dateCreation: 1700000000,
				dateModification: 1700000000,
				id: "doc-1",
				type: "PDF",
				nom: "cg.pdf",
				dateValidation: 1700000000,
				contenu: "base64...",
			},
		],
		usager: {
			adresse: {
				voie: "Rue de Paris",
				numVoie: "10",
				commune: "Paris",
				adresseComplete: "10 Rue de Paris 75001 Paris",
				codePays: "FR",
				codePostal: "75001",
				complement: "",
				pays: "France",
			},
			mobile: "0600000000",
			nom: "Dupont",
			prenom: "Jean",
			email: "jean.dupont@test.com",
		},
		vehicules: [
			{
				dateCreation: 1700000000,
				dateModification: 1700000000,
				actif: true,
				valide: true,
				type: 1,
				codeClient: "CLI-01",
				marque: "Renault",
				dateSupression: 0,
				idUsager: "usager-1",
				modele: "Clio",
				electrique: false,
				peutChangerEtatActif: true,
				dateActivation: 1700000000,
				id: "veh-1",
				immatriculation: "AA-123-AA",
				dateValidation: 1700000000,
				dateRetrait: 0,
			},
		],
		callback: "https://api.test.com/callback",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		DemandeService.init();
	});

	describe("DemandeController", () => {
		it("should accept valid demande and emit create event with HTTP 202", async () => {
			const controller = new DemandeController();
			const emitSpy = vi.spyOn(eventBus, "emit");

			const req = {
				body: validDemande,
				correlationId: "corr-gv-1",
			} as unknown as Request;

			const res = {
				status: vi.fn().mockReturnThis(),
				json: vi.fn().mockReturnThis(),
			} as unknown as ExpressResponse;

			await controller.createDemande(req, res);

			expect(res.status).toHaveBeenCalledWith(202);
			expect(emitSpy).toHaveBeenCalledWith(DemandeEvents.create, validDemande);
		});
	});

	describe("DemandeService", () => {
		it("should publish demande to Redis Stream via redisStreamBus when DemandeEvents.create is emitted", async () => {
			const multiMock = {
				xAdd: vi.fn().mockReturnThis(),
				expire: vi.fn().mockReturnThis(),
				set: vi.fn().mockReturnThis(),
				exec: vi.fn().mockResolvedValue(["ok", "ok", "ok"]),
			};
			vi.spyOn(redisWriter, "multi").mockReturnValue(multiMock as any);

			eventBus.emit(DemandeEvents.create, validDemande as any);

			// Allow async promise microtask
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(multiMock.xAdd).toHaveBeenCalledWith(
				expect.stringContaining("jobs:queue"),
				"*",
				expect.objectContaining({
					event: "gv.created",
					data: expect.stringContaining('"uid":"demande-123"'),
				}),
			);

			expect(multiMock.exec).toHaveBeenCalled();
		});

		it("should call webhook callback in demandeCompleted and return true on success", async () => {
			const globalFetchSpy = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValueOnce(new Response(JSON.stringify({ received: true }), { status: 200, statusText: "OK" }));

			const success = await DemandeService.demandeCompleted(validDemande as any);

			expect(success).toBe(true);
			expect(globalFetchSpy).toHaveBeenCalledWith(
				validDemande.callback,
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(validDemande),
				}),
			);
		});

		it("should handle webhook callback error and return false gracefully", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
				new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }),
			);

			const success = await DemandeService.demandeCompleted(validDemande as any);

			expect(success).toBe(false);
		});
	});
});
