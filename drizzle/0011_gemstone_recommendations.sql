CREATE TABLE "gemstone_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer,
	"name" varchar(120) NOT NULL,
	"birth_date" varchar(10) NOT NULL,
	"concern" varchar(300),
	"zodiac_sign" varchar(12) NOT NULL,
	"category_slugs" varchar(200) DEFAULT '' NOT NULL,
	"narrative" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gemstone_recommendations" ADD CONSTRAINT "gemstone_recommendations_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "gemstone_recommendations_created_idx" ON "gemstone_recommendations" USING btree ("created_at");
