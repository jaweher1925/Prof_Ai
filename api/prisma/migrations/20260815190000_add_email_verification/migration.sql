-- AlterTable
ALTER TABLE "users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "verification_code_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "verification_code_expires" DATETIME;
ALTER TABLE "users" ADD COLUMN "verification_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "verification_sent_at" DATETIME;
