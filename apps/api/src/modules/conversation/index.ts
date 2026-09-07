import { ConversationService } from "./ConversationService";

export * from "./conversation.schema";
export * from "./conversation.commands";
export * from "./conversation.events";
export * from "./conversation.streams";
export * from "./ConversationRepository";
export * from "./ConversationService";
export * from "./ConversationController";

export function initConversationModule(): void {
	ConversationService.init();
}
