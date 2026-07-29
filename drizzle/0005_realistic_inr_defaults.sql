ALTER TABLE "practitioners" ALTER COLUMN "chat_rate_per_minute" SET DEFAULT 15;--> statement-breakpoint
UPDATE "practitioners" SET "chat_rate_per_minute" = 15 WHERE "chat_rate_per_minute" = 5;