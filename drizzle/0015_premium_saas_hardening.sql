CREATE TABLE "member_2fa_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_2fa_challenges_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "practitioner_2fa_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_2fa_challenges_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "member_users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "member_users" ADD COLUMN "firebase_uid" varchar(128);--> statement-breakpoint
ALTER TABLE "member_users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "member_users" ADD COLUMN "email_verification_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "member_users" ADD COLUMN "email_verification_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_users" ADD COLUMN "password_reset_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "member_users" ADD COLUMN "password_reset_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "member_users" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "member_users" ADD COLUMN "totp_backup_codes" jsonb;--> statement-breakpoint
ALTER TABLE "member_users" ADD CONSTRAINT "member_users_firebase_uid_unique" UNIQUE("firebase_uid");--> statement-breakpoint
ALTER TABLE "member_users" ADD CONSTRAINT "member_users_email_verification_token_hash_unique" UNIQUE("email_verification_token_hash");--> statement-breakpoint
ALTER TABLE "member_users" ADD CONSTRAINT "member_users_password_reset_token_hash_unique" UNIQUE("password_reset_token_hash");--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "firebase_uid" varchar(128);--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "email_verification_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "email_verification_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "password_reset_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "password_reset_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "totp_backup_codes" jsonb;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "bank_account_name" varchar(120);--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "bank_account_number_enc" text;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "bank_ifsc" varchar(20);--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "upi_id_enc" text;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "payout_details_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_firebase_uid_unique" UNIQUE("firebase_uid");--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_email_verification_token_hash_unique" UNIQUE("email_verification_token_hash");--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_password_reset_token_hash_unique" UNIQUE("password_reset_token_hash");--> statement-breakpoint
ALTER TABLE "practitioner_payouts" ADD COLUMN "payout_method" varchar(20) DEFAULT 'bank_transfer' NOT NULL;--> statement-breakpoint
ALTER TABLE "practitioner_payouts" ADD COLUMN "transaction_ref" varchar(120);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "subtotal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_rate" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "invoices" SET "subtotal" = "amount" WHERE "subtotal" = 0;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "gst_rate" real DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "gstin" varchar(20);--> statement-breakpoint
ALTER TABLE "member_2fa_challenges" ADD CONSTRAINT "member_2fa_challenges_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_2fa_challenges" ADD CONSTRAINT "practitioner_2fa_challenges_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_2fa_challenges_member_id_idx" ON "member_2fa_challenges" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "practitioner_2fa_challenges_practitioner_id_idx" ON "practitioner_2fa_challenges" USING btree ("practitioner_id");
