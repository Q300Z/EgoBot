import { prisma } from "../config/db.js";
import { Status } from "@prisma/client";

export class JobRepository {
  static async create(data: {
    id: string;
    conversation_id: string;
    user_prompt_id: string;
    assistant_message_id: string;
    model: string;
  }) {
    return prisma.job.create({
      data: {
        id: data.id,
        conversation_id: data.conversation_id,
        user_prompt_id: data.user_prompt_id,
        assistant_message_id: data.assistant_message_id,
        model: data.model,
        status: "PENDING",
      },
    });
  }

  static async findById(id: string) {
    return prisma.job.findUnique({ where: { id } });
  }

  static async update(id: string, data: any) {
    return prisma.job.update({
      where: { id },
      data,
    });
  }

  static async findStuckJobs(limitDate: Date) {
    return prisma.job.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] as Status[] },
        updated_at: { lt: limitDate },
      },
    });
  }
}
