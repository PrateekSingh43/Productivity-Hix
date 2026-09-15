-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "planned_start" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tasks_user_id_planned_start_idx" ON "tasks"("user_id", "planned_start");
