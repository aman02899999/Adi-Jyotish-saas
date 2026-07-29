CREATE TABLE "gemstone_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gemstone_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "gemstone_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"short_description" varchar(300) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"benefits" text DEFAULT '' NOT NULL,
	"who_should_wear" text DEFAULT '' NOT NULL,
	"recommended_zodiac" varchar(200) DEFAULT '' NOT NULL,
	"recommended_planets" varchar(200) DEFAULT '' NOT NULL,
	"origin" varchar(120) DEFAULT '' NOT NULL,
	"color" varchar(80) DEFAULT '' NOT NULL,
	"treatment" varchar(120) DEFAULT '' NOT NULL,
	"certification" varchar(120) DEFAULT '' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"sku" varchar(60) NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"trending" boolean DEFAULT false NOT NULL,
	"bestseller" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"meta_title" varchar(160) DEFAULT '' NOT NULL,
	"meta_description" varchar(300) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gemstone_products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "gemstone_products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "gemstone_product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"url" text NOT NULL,
	"alt" varchar(200) DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gemstone_product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"label" varchar(120) NOT NULL,
	"weight_carat" varchar(20) DEFAULT '' NOT NULL,
	"weight_ratti" varchar(20) DEFAULT '' NOT NULL,
	"certification_level" varchar(80) DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"compare_at_price" integer,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"sku" varchar(60) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gemstone_product_variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "gemstone_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" varchar(30) NOT NULL,
	"member_id" integer,
	"guest_name" varchar(120),
	"guest_email" varchar(180),
	"guest_phone" varchar(40),
	"shipping_name" varchar(120) NOT NULL,
	"shipping_phone" varchar(40) NOT NULL,
	"shipping_line1" varchar(200) NOT NULL,
	"shipping_line2" varchar(200),
	"shipping_city" varchar(100) NOT NULL,
	"shipping_state" varchar(100) NOT NULL,
	"shipping_pincode" varchar(12) NOT NULL,
	"shipping_country" varchar(80) DEFAULT 'India' NOT NULL,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"shipping_fee" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"coupon_code" varchar(40),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"razorpay_order_id" varchar(80),
	"razorpay_payment_id" varchar(80),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gemstone_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "gemstone_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"product_name" varchar(160) NOT NULL,
	"variant_label" varchar(120) NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gemstone_wishlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gemstone_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"member_id" integer,
	"order_id" integer,
	"reviewer_name" varchar(120) NOT NULL,
	"rating" integer NOT NULL,
	"title" varchar(160) DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"image_urls" text DEFAULT '' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"helpful_votes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gemstone_coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"description" varchar(200) DEFAULT '' NOT NULL,
	"discount_type" varchar(10) DEFAULT 'percent' NOT NULL,
	"discount_value" integer NOT NULL,
	"min_order_amount" integer DEFAULT 0 NOT NULL,
	"max_discount_amount" integer,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_customer_limit" integer,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gemstone_coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "gemstone_products" ADD CONSTRAINT "gemstone_products_category_id_gemstone_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."gemstone_categories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_product_images" ADD CONSTRAINT "gemstone_product_images_product_id_gemstone_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."gemstone_products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_product_variants" ADD CONSTRAINT "gemstone_product_variants_product_id_gemstone_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."gemstone_products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_orders" ADD CONSTRAINT "gemstone_orders_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_order_items" ADD CONSTRAINT "gemstone_order_items_order_id_gemstone_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."gemstone_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_order_items" ADD CONSTRAINT "gemstone_order_items_product_id_gemstone_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."gemstone_products"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_order_items" ADD CONSTRAINT "gemstone_order_items_variant_id_gemstone_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."gemstone_product_variants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_wishlist" ADD CONSTRAINT "gemstone_wishlist_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_wishlist" ADD CONSTRAINT "gemstone_wishlist_product_id_gemstone_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."gemstone_products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_reviews" ADD CONSTRAINT "gemstone_reviews_product_id_gemstone_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."gemstone_products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_reviews" ADD CONSTRAINT "gemstone_reviews_member_id_member_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gemstone_reviews" ADD CONSTRAINT "gemstone_reviews_order_id_gemstone_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."gemstone_orders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "gemstone_products_category_idx" ON "gemstone_products" USING btree ("category_id","active");
--> statement-breakpoint
CREATE INDEX "gemstone_product_images_product_idx" ON "gemstone_product_images" USING btree ("product_id","sort_order");
--> statement-breakpoint
CREATE INDEX "gemstone_product_variants_product_idx" ON "gemstone_product_variants" USING btree ("product_id","active");
--> statement-breakpoint
CREATE INDEX "gemstone_orders_member_idx" ON "gemstone_orders" USING btree ("member_id","created_at");
--> statement-breakpoint
CREATE INDEX "gemstone_orders_status_idx" ON "gemstone_orders" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "gemstone_orders_razorpay_payment_id_unique" ON "gemstone_orders" USING btree ("razorpay_payment_id");
--> statement-breakpoint
CREATE INDEX "gemstone_order_items_order_idx" ON "gemstone_order_items" USING btree ("order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "gemstone_wishlist_member_product_unique" ON "gemstone_wishlist" USING btree ("member_id","product_id");
--> statement-breakpoint
CREATE INDEX "gemstone_reviews_product_status_idx" ON "gemstone_reviews" USING btree ("product_id","status");
