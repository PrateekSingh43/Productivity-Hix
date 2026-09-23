CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "finish_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_conversations_user_id_updated_at_idx" ON "ai_conversations"("user_id", "updated_at");
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");

ALTER TABLE "ai_conversations"
  ADD CONSTRAINT "ai_conversations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_messages"
  ADD CONSTRAINT "ai_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
