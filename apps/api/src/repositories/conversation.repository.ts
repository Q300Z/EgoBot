import { prisma } from "../config/db.js";

export class ConversationRepository {
  static async create(data: { user_id: string; title: string; model?: string }) {
    return prisma.conversation.create({
      data: {
        user_id: data.user_id,
        title: data.title,
        model: data.model || "CHATBOT",
      },
    });
  }

  static async findById(id: string) {
    return prisma.conversation.findFirst({
      where: { id, deleted_at: null },
      include: {
        messages: {
          orderBy: { created_at: "asc" },
        },
      },
    });
  }

  static async findByUserId(userId: string) {
    return prisma.conversation.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { updated_at: "desc" },
    });
  }

  static async softDelete(id: string) {
    return prisma.conversation.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  static async addMessage(data: { conversation_id: string; role: "USER" | "ASSISTANT"; content: string }) {
    return prisma.message.create({
      data: {
        conversation_id: data.conversation_id,
        role: data.role,
        content: data.content,
      },
    });
  }

  static async updateMessageContent(id: string, content: string) {
    return prisma.message.update({
      where: { id },
      data: { content },
    });
  }
}
