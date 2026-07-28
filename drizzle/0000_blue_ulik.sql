CREATE TABLE "admin_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(180) NOT NULL,
	"role" varchar(30) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"invited_by" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(180) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(30) DEFAULT 'owner' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"admin_name" varchar(120) NOT NULL,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(80),
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_rate_limits_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(24) NOT NULL,
	"service_id" integer,
	"service_title" varchar(120) NOT NULL,
	"service_price" integer NOT NULL,
	"service_duration" integer DEFAULT 30 NOT NULL,
	"practitioner_id" integer,
	"practitioner_name" varchar(120),
	"client_name" varchar(120) NOT NULL,
	"client_email" varchar(180) NOT NULL,
	"client_phone" varchar(40),
	"birth_date" varchar(10) NOT NULL,
	"birth_time" varchar(8) NOT NULL,
	"birth_place" varchar(180) NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"notes" text,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"payment_status" varchar(30) DEFAULT 'unpaid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "favorite_practitioners" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"practitioner_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(32) NOT NULL,
	"booking_id" integer NOT NULL,
	"member_id" integer,
	"customer_name" varchar(120) NOT NULL,
	"customer_email" varchar(180) NOT NULL,
	"description" varchar(180) NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "member_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "member_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(180) NOT NULL,
	"password_hash" text NOT NULL,
	"phone" varchar(40),
	"birth_date" varchar(10),
	"birth_time" varchar(8),
	"birth_place" varchar(180),
	"plan" varchar(30) DEFAULT 'member' NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "message_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"booking_id" integer,
	"subject" varchar(160) NOT NULL,
	"category" varchar(40) DEFAULT 'support' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"booking_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"provider" varchar(24) DEFAULT 'manual' NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"provider_session_id" varchar(180),
	"payment_intent_id" varchar(180),
	"refund_id" varchar(180),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_session_id_unique" UNIQUE("provider_session_id")
);
--> statement-breakpoint
CREATE TABLE "practitioner_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"member_id" integer,
	"booking_id" integer NOT NULL,
	"reviewer_name" varchar(120) NOT NULL,
	"rating" integer NOT NULL,
	"clarity" integer NOT NULL,
	"empathy" integer NOT NULL,
	"usefulness" integer NOT NULL,
	"body" text NOT NULL,
	"status" varchar(24) DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_reviews_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "practitioner_time_off" (
	"id" serial PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" varchar(180),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practitioners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"email" varchar(180) NOT NULL,
	"title" varchar(120) DEFAULT 'Vedic Astrologer' NOT NULL,
	"bio" text NOT NULL,
	"specialties" text NOT NULL,
	"languages" varchar(240) DEFAULT 'English, Hindi' NOT NULL,
	"consultation_modes" varchar(160) DEFAULT 'Video, Audio, Chat' NOT NULL,
	"experience_years" integer DEFAULT 5 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verification_level" varchar(40) DEFAULT 'reviewed' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioners_slug_unique" UNIQUE("slug"),
	CONSTRAINT "practitioners_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "razorpay_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"razorpay_event_id" varchar(180) NOT NULL,
	"type" varchar(100) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "razorpay_events_razorpay_event_id_unique" UNIQUE("razorpay_event_id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"category" varchar(60) NOT NULL,
	"description" text NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"duration" integer DEFAULT 30 NOT NULL,
	"icon" varchar(40) DEFAULT 'sparkles' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "studio_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"studio_name" varchar(120) DEFAULT 'Jyotish Studio' NOT NULL,
	"support_email" varchar(180) DEFAULT 'support@jyotish.studio' NOT NULL,
	"timezone" varchar(80) DEFAULT 'Asia/Kolkata' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"cancellation_hours" integer DEFAULT 24 NOT NULL,
	"booking_lead_minutes" integer DEFAULT 15 NOT NULL,
	"reply_sla_hours" integer DEFAULT 24 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"sender_type" varchar(20) NOT NULL,
	"sender_name" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"read_by_member" boolean DEFAULT false NOT NULL,
	"read_by_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_invited_by_admin_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_practitioners" ADD CONSTRAINT "favorite_practitioners_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_practitioners" ADD CONSTRAINT "favorite_practitioners_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_reviews" ADD CONSTRAINT "practitioner_reviews_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_reviews" ADD CONSTRAINT "practitioner_reviews_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_reviews" ADD CONSTRAINT "practitioner_reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_time_off" ADD CONSTRAINT "practitioner_time_off_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_invites_email_idx" ON "admin_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "admin_invites_expiry_idx" ON "admin_invites" USING btree ("expires_at","accepted_at");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_admin_id_idx" ON "audit_logs" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "availability_practitioner_weekday_idx" ON "availability_rules" USING btree ("practitioner_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_practitioner_start_unique" ON "bookings" USING btree ("practitioner_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "bookings_client_email_idx" ON "bookings" USING btree ("client_email");--> statement-breakpoint
CREATE INDEX "bookings_scheduled_at_idx" ON "bookings" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_member_practitioner_unique" ON "favorite_practitioners" USING btree ("member_id","practitioner_id");--> statement-breakpoint
CREATE INDEX "favorite_practitioner_idx" ON "favorite_practitioners" USING btree ("practitioner_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_email_idx" ON "invoices" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "invoices_member_id_idx" ON "invoices" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "member_sessions_member_id_idx" ON "member_sessions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "message_threads_member_last_idx" ON "message_threads" USING btree ("member_id","last_message_at");--> statement-breakpoint
CREATE INDEX "message_threads_booking_id_idx" ON "message_threads" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_created_idx" ON "payments" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_booking_id_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_payment_intent_idx" ON "payments" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "practitioner_reviews_public_idx" ON "practitioner_reviews" USING btree ("practitioner_id","status","created_at");--> statement-breakpoint
CREATE INDEX "practitioner_reviews_member_idx" ON "practitioner_reviews" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "practitioner_time_off_range_idx" ON "practitioner_time_off" USING btree ("practitioner_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "thread_messages_thread_created_idx" ON "thread_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "thread_messages_admin_unread_idx" ON "thread_messages" USING btree ("sender_type","read_by_admin");--> statement-breakpoint
CREATE INDEX "thread_messages_member_unread_idx" ON "thread_messages" USING btree ("read_by_member");