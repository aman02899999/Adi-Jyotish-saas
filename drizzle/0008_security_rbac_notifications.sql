ALTER TABLE "admin_users" ADD COLUMN "totp_secret" text;
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "totp_backup_codes" jsonb;
--> statement-breakpoint
CREATE TABLE "admin_2fa_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_2fa_challenges_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "admin_2fa_challenges" ADD CONSTRAINT "admin_2fa_challenges_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "admin_2fa_challenges_admin_id_idx" ON "admin_2fa_challenges" USING btree ("admin_id");
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"id" serial PRIMARY KEY NOT NULL,
	"bucket_key" varchar(160) NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_buckets_bucket_key_unique" UNIQUE("bucket_key")
);
--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_window_idx" ON "rate_limit_buckets" USING btree ("window_started_at");
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_type" varchar(10) NOT NULL,
	"recipient_id" integer NOT NULL,
	"type" varchar(60) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text,
	"link" varchar(300),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_type","recipient_id","created_at");
--> statement-breakpoint
INSERT INTO "admin_roles" ("slug", "name", "is_system", "permissions") VALUES
	('owner', 'Owner', true, '["overview","services","members_view","members_manage","bookings","schedule","billing","plans","reviews","messages","insights","reports","activity","settings","team","gemstones","roles"]'::jsonb),
	('manager', 'Manager', true, '["overview","services","members_view","members_manage","bookings","schedule","billing","plans","reviews","messages","insights","reports","activity","gemstones"]'::jsonb),
	('support', 'Support', true, '["overview","members_view","bookings","messages"]'::jsonb),
	('analyst', 'Analyst', true, '["overview","insights","reports"]'::jsonb)
ON CONFLICT ("slug") DO NOTHING;
