import { Router, type Request, type Response } from "express";
import { prisma } from "../config/db";
import { valkeyReader } from "../config/valkey";

export const healthRouter = Router();

export async function healthCheckHandler(_req: Request, res: Response): Promise<void> {
	let dbStatus: "ok" | string = "ok";
	let valkeyStatus: "ok" | string = "ok";

	try {
		await (prisma as any).$queryRawUnsafe("SELECT 1;");
	} catch (error) {
		dbStatus = error instanceof Error ? error.message : "Erreur connexion DB";
	}

	try {
		const pong = await valkeyReader.ping();
		if (!pong) {
			valkeyStatus = "Pas de réponse PING de Valkey";
		}
	} catch (error) {
		valkeyStatus = error instanceof Error ? error.message : "Erreur connexion Valkey";
	}

	const isHealthy = dbStatus === "ok" && valkeyStatus === "ok";
	const statusCode = isHealthy ? 200 : 503;

	res.status(statusCode).json({
		status: isHealthy ? "ok" : "error",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		checks: {
			database: dbStatus,
			valkey: valkeyStatus,
		},
	});
}

healthRouter.get("/", healthCheckHandler);
healthRouter.get("/health", healthCheckHandler);
