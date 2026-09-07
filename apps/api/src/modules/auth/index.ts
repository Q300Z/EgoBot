import { AuthService } from "./AuthService";

export * from "./auth.schema";
export * from "./auth.commands";
export * from "./auth.events";
export * from "./auth.streams";
export * from "./AuthRepository";
export * from "./AuthService";
export * from "./AuthController";

export function initAuthModule(): void {
	AuthService.init();
}
