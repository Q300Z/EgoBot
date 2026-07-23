import { prisma } from "../config/db.js";
import { Role } from "@prisma/client";

export class UserRepository {
  static async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  static async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  static async create(data: { email: string; password_hash: string; role?: Role }) {
    return prisma.user.create({
      data: {
        email: data.email,
        password_hash: data.password_hash,
        role: data.role || "USER",
      },
    });
  }

  static async findAll() {
    return prisma.user.findMany({
      select: { id: true, email: true, role: true, created_at: true, updated_at: true },
      orderBy: { created_at: "desc" },
    });
  }

  static async delete(id: string) {
    return prisma.user.delete({ where: { id } });
  }
}
