-- Owning professor for each project (2026-08-13). Nullable, no FK constraint
-- — see the schema.prisma comment on Project.userId for why. Existing rows
-- get NULL (no known owner); they remain visible only via the unfiltered
-- /api/admin/projects console until reassigned.
ALTER TABLE "projects" ADD COLUMN "user_id" TEXT;
