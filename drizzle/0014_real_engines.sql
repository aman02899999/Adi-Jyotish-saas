ALTER TABLE "kundli_matches" ADD COLUMN "person_a_birth_time" varchar(5) NOT NULL DEFAULT '12:00';--> statement-breakpoint
ALTER TABLE "kundli_matches" ADD COLUMN "person_a_birth_place" varchar(160) NOT NULL DEFAULT 'Unknown';--> statement-breakpoint
ALTER TABLE "kundli_matches" ADD COLUMN "person_b_birth_time" varchar(5) NOT NULL DEFAULT '12:00';--> statement-breakpoint
ALTER TABLE "kundli_matches" ADD COLUMN "person_b_birth_place" varchar(160) NOT NULL DEFAULT 'Unknown';--> statement-breakpoint
ALTER TABLE "kundli_matches" ADD COLUMN "breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "kundli_matches" ALTER COLUMN "person_a_birth_time" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "kundli_matches" ALTER COLUMN "person_a_birth_place" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "kundli_matches" ALTER COLUMN "person_b_birth_time" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "kundli_matches" ALTER COLUMN "person_b_birth_place" DROP DEFAULT;--> statement-breakpoint
UPDATE "kundli_matches" SET "breakdown" = '{"varna":0,"vashya":0,"tara":0,"yoni":0,"grahaMaitri":0,"gana":0,"bhakoot":0,"nadi":0}'::jsonb WHERE "breakdown" IS NULL;--> statement-breakpoint
ALTER TABLE "kundli_matches" ALTER COLUMN "breakdown" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kundli_matches" ALTER COLUMN "compatibility_score" TYPE real;--> statement-breakpoint
DROP TABLE "daily_panchang";
