ALTER TABLE "invoices" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "membership_plans" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "studio_settings" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "currency" SET DEFAULT 'INR';--> statement-breakpoint
UPDATE "studio_settings" SET "currency" = 'INR' WHERE "currency" = 'USD';--> statement-breakpoint
UPDATE "membership_plans" SET "currency" = 'INR' WHERE "currency" = 'USD';--> statement-breakpoint
UPDATE "wallets" SET "currency" = 'INR' WHERE "currency" = 'USD';