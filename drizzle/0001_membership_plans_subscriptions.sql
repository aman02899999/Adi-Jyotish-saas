CREATE TABLE "member_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"billing_interval" varchar(10) DEFAULT 'monthly' NOT NULL,
	"status" varchar(20) DEFAULT 'created' NOT NULL,
	"razorpay_subscription_id" varchar(60),
	"razorpay_customer_id" varchar(60),
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_subscriptions_member_id_unique" UNIQUE("member_id"),
	CONSTRAINT "member_subscriptions_razorpay_subscription_id_unique" UNIQUE("razorpay_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"tagline" varchar(160) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_monthly" integer DEFAULT 0 NOT NULL,
	"price_yearly" integer,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"features" text DEFAULT '' NOT NULL,
	"session_discount_percent" integer DEFAULT 0 NOT NULL,
	"highlighted" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"razorpay_plan_id_monthly" varchar(60),
	"razorpay_plan_id_yearly" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_plans_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "subscription_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(20) DEFAULT 'paid' NOT NULL,
	"razorpay_payment_id" varchar(60),
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_invoices_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);
--> statement-breakpoint
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_member_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."member_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_subscriptions_status_idx" ON "member_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "member_subscriptions_plan_idx" ON "member_subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "membership_plans_sort_idx" ON "membership_plans" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "subscription_invoices_member_created_idx" ON "subscription_invoices" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_invoices_subscription_idx" ON "subscription_invoices" USING btree ("subscription_id");