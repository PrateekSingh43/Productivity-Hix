-- CreateTable
CREATE TABLE "task_schedule_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "from_date" TEXT,
    "to_date" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_schedule_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_schedule_history_user_id_task_id_changed_at_idx" ON "task_schedule_history"("user_id", "task_id", "changed_at");

-- AddForeignKey
ALTER TABLE "task_schedule_history" ADD CONSTRAINT "task_schedule_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_schedule_history" ADD CONSTRAINT "task_schedule_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
