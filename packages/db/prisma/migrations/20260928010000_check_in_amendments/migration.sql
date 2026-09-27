-- CreateTable
CREATE TABLE "check_in_amendments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "check_in_id" TEXT NOT NULL,
    "activity_assessment" TEXT,
    "alignment" TEXT,
    "reasons" TEXT[] NOT NULL DEFAULT '{}',
    "state" TEXT,
    "energy" TEXT,
    "focus" TEXT,
    "note" VARCHAR(500),
    "blocker" VARCHAR(500),
    "productive" BOOLEAN,
    "outcome" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "check_in_amendments_check_in_id_created_at_idx" ON "check_in_amendments"("check_in_id", "created_at");

-- AddForeignKey
ALTER TABLE "check_in_amendments" ADD CONSTRAINT "check_in_amendments_check_in_id_fkey" FOREIGN KEY ("check_in_id") REFERENCES "check_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_amendments" ADD CONSTRAINT "check_in_amendments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS hardening for the new table (matches 20260928000000 policy):
-- API connects as table owner (bypasses RLS; FORCE RLS deliberately not set),
-- direct anon/authenticated access defaults to deny, service_role documented.
ALTER TABLE "public"."check_in_amendments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON "public"."check_in_amendments" FOR ALL TO service_role USING (true) WITH CHECK (true);
