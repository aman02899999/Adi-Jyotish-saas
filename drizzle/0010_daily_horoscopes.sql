CREATE TABLE "daily_horoscopes" (
	"id" serial PRIMARY KEY NOT NULL,
	"sign" varchar(12) NOT NULL,
	"date" varchar(10) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_horoscopes_sign_date_unique" UNIQUE("sign","date")
);
