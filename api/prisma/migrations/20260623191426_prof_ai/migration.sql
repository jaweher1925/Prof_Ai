-- AlterTable
ALTER TABLE "projects" ADD COLUMN "avatar_background" TEXT;
ALTER TABLE "projects" ADD COLUMN "avatar_style" TEXT DEFAULT 'normal';
ALTER TABLE "projects" ADD COLUMN "voice_settings" TEXT;
