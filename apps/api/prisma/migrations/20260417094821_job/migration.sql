/*
  Warnings:

  - Added the required column `model` to the `Conversation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `Job` table without a default value. This is not possible if the table is not empty.
  - Made the column `assistant_message_id` on table `Job` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user_prompt_id` on table `Job` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_Conversation" ("client_id", "created_at", "id", "title", "updated_at", "user_id") SELECT "client_id", "created_at", "id", "title", "updated_at", "user_id" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_user_id_idx" ON "Conversation"("user_id");
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversation_id" TEXT NOT NULL,
    "user_prompt_id" TEXT NOT NULL,
    "assistant_message_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "model" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "started_at" DATETIME,
    "ended_at" DATETIME,
    "error" TEXT,
    "generated_tokens" INTEGER,
    "time_to_first_token" REAL,
    "tokens_per_second" REAL,
    CONSTRAINT "Job_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Job_user_prompt_id_fkey" FOREIGN KEY ("user_prompt_id") REFERENCES "Message" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_assistant_message_id_fkey" FOREIGN KEY ("assistant_message_id") REFERENCES "Message" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("assistant_message_id", "conversation_id", "created_at", "ended_at", "error", "generated_tokens", "id", "started_at", "status", "time_to_first_token", "tokens_per_second", "updated_at", "user_prompt_id") SELECT "assistant_message_id", "conversation_id", "created_at", "ended_at", "error", "generated_tokens", "id", "started_at", "status", "time_to_first_token", "tokens_per_second", "updated_at", "user_prompt_id" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE INDEX "Job_conversation_id_idx" ON "Job"("conversation_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
