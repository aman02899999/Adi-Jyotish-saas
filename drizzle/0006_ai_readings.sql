CREATE TABLE "ai_readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"client_name" varchar(120) NOT NULL,
	"birth_date" varchar(20) NOT NULL,
	"birth_time" varchar(20) NOT NULL,
	"birth_place" varchar(160) NOT NULL,
	"question" text NOT NULL,
	"price" integer NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"status" varchar(20) DEFAULT 'pending_payment' NOT NULL,
	"razorpay_order_id" varchar(80),
	"razorpay_payment_id" varchar(80),
	"answer" text,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_readings" ADD CONSTRAINT "ai_readings_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_readings_member_idx" ON "ai_readings" USING btree ("member_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_readings_razorpay_payment_id_unique" ON "ai_readings" USING btree ("razorpay_payment_id");
