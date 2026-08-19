-- AlterTable
-- Adds the admin/professor role split. Every existing user (all signed up
-- through the professor-only flow so far) defaults to "professor" so this is
-- a zero-downtime, backward-compatible add — nothing existing changes
-- behavior until a row is explicitly promoted to "admin" (see the seed
-- script: api/scripts/promoteAdmin.ts).
ALTER TABLE "users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'professor';

-- AlterTable
-- Persists which HeyGen engine rendered each scene's avatar clip, so the
-- admin dashboard's cost breakdown reflects real data instead of nothing —
-- previously this only existed transiently in the pending-job sidecar file.
ALTER TABLE "scenes" ADD COLUMN "avatar_engine_used" TEXT;

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");
