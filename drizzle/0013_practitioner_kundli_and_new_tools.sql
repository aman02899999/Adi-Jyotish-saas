ALTER TABLE "bookings" ADD COLUMN "kundli_summary" text;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "kundli_generated_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "daily_panchang" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" varchar(10) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_panchang_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "kundli_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer,
	"person_a_name" varchar(120) NOT NULL,
	"person_a_birth_date" varchar(10) NOT NULL,
	"person_b_name" varchar(120) NOT NULL,
	"person_b_birth_date" varchar(10) NOT NULL,
	"compatibility_score" integer NOT NULL,
	"narrative" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "numerology_readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer,
	"name" varchar(120) NOT NULL,
	"birth_date" varchar(10) NOT NULL,
	"life_path_number" integer NOT NULL,
	"destiny_number" integer NOT NULL,
	"narrative" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kundli_matches" ADD CONSTRAINT "kundli_matches_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "numerology_readings" ADD CONSTRAINT "numerology_readings_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "kundli_matches_created_idx" ON "kundli_matches" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "numerology_readings_created_idx" ON "numerology_readings" USING btree ("created_at");
