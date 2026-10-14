CREATE TYPE "public"."review_source" AS ENUM('customer', 'staff', 'import');--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "source" "review_source" DEFAULT 'customer' NOT NULL;--> statement-breakpoint
-- Backfill: a review with no submitting account and no request IP was never posted through the site —
-- those are the CSV imports (scripts/import-reviews-csv.ts). Everything else stays "customer".
UPDATE "reviews" SET "source" = 'import' WHERE "user_id" IS NULL AND "ip_hash" IS NULL;
