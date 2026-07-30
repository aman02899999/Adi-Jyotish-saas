ALTER TABLE "ai_readings" ADD COLUMN "reading_type" varchar(20) DEFAULT 'question' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_readings" ALTER COLUMN "question" DROP NOT NULL;
