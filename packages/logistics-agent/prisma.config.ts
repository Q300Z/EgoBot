import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./logistics.db",
  },
  migrations: {
    path: "./prisma/migrations",
    seed: "node --import tsx prisma/seed.ts",
  },
});
