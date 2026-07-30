ALTER TABLE "notifications" ALTER COLUMN "recipient_type" TYPE varchar(20);
--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "password_hash" text;
--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "last_login_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "practitioner_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "practitioner_sessions" ADD CONSTRAINT "practitioner_sessions_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "practitioner_sessions_practitioner_id_idx" ON "practitioner_sessions" USING btree ("practitioner_id");
--> statement-breakpoint
CREATE TABLE "practitioner_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"invited_by" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_invites_practitioner_id_unique" UNIQUE("practitioner_id"),
	CONSTRAINT "practitioner_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "practitioner_invites" ADD CONSTRAINT "practitioner_invites_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "practitioner_invites" ADD CONSTRAINT "practitioner_invites_invited_by_admin_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "practitioner_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" varchar(20) DEFAULT 'requested' NOT NULL,
	"notes" text,
	"admin_notes" text,
	"processed_by" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practitioner_payouts" ADD CONSTRAINT "practitioner_payouts_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "practitioner_payouts" ADD CONSTRAINT "practitioner_payouts_processed_by_admin_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "practitioner_payouts_practitioner_id_idx" ON "practitioner_payouts" USING btree ("practitioner_id");
