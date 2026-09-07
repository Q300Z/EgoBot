-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "deleted_at" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "Job_user_prompt_id_fkey" FOREIGN KEY ("user_prompt_id") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Job_assistant_message_id_fkey" FOREIGN KEY ("assistant_message_id") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("assistant_message_id", "conversation_id", "created_at", "ended_at", "error", "generated_tokens", "id", "model", "started_at", "status", "time_to_first_token", "tokens_per_second", "updated_at", "user_prompt_id") SELECT "assistant_message_id", "conversation_id", "created_at", "ended_at", "error", "generated_tokens", "id", "model", "started_at", "status", "time_to_first_token", "tokens_per_second", "updated_at", "user_prompt_id" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE INDEX "Job_conversation_id_idx" ON "Job"("conversation_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
