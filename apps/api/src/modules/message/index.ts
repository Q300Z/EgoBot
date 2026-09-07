import { MessageService } from "./MessageService";

export * from "./message.schema";
export * from "./message.commands";
export * from "./message.events";
export * from "./message.streams";
export * from "./MessageRepository";
export * from "./MessageService";
export * from "./MessageController";

export function initMessageModule(): void {
	MessageService.init();
}
