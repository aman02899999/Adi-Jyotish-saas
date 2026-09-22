-- =============================================================================
-- Migration 0003 — Gemstone store, site content, CMS
-- Adi Jyotish SaaS — Firebase → Supabase (Postgres)
--
-- Same conventions as 0001/0002.
--
-- NOTE ON SUBCOLLECTIONS. Firestore nests several of these under a parent doc:
--   gemstoneProducts/{id}/variants/{id}      -> gemstone_product_variants
--   gemstoneProducts/{id}/images/{id}        -> gemstone_product_images
--   gemstoneOrders/{id}/items/{id}           -> gemstone_order_items
--   members/{id}/wishlist/{productId}        -> gemstone_wishlist
--   members/{id}/favorites/{practitionerId}  -> member_favorites
-- Flattening them is the point of the move, but it means the parent_id column is
-- now load-bearing where Firestore implied it by nesting. The copy script must
-- populate it from the parent path, not from a field in the child document.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- gemstone_categories  (src/lib/gemstones.ts GemstoneCategory)
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_categories (
  id          text primary key,
  name        text        not null,
  slug        text        not null,
  description text        not null default '',
  image_url   text,
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists gemstone_categories_slug_key on public.gemstone_categories (slug);

-- -----------------------------------------------------------------------------
-- gemstone_products  (src/lib/gemstones.ts GemstoneProduct)
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_products (
  id                  text primary key,
  category_id         text        references public.gemstone_categories (id) on delete set null,
  name                text        not null,
  slug                text        not null,
  short_description   text        not null default '',
  description         text        not null default '',
  benefits            text        not null default '',
  who_should_wear     text        not null default '',
  recommended_zodiac  text        not null default '',
  recommended_planets text        not null default '',
  origin              text        not null default '',
  color               text        not null default '',
  treatment           text        not null default '',
  certification       text        not null default '',
  certificate_url     text,
  currency            text        not null default 'INR',
  sku                 text        not null default '',
  featured            boolean     not null default false,
  trending            boolean     not null default false,
  bestseller          boolean     not null default false,
  active              boolean     not null default true,
  meta_title          text        not null default '',
  meta_description    text        not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists gemstone_products_slug_key on public.gemstone_products (slug);
create index if not exists gemstone_products_category_active_idx on public.gemstone_products (category_id, active);

-- -----------------------------------------------------------------------------
-- gemstone_product_variants  (src/lib/gemstones.ts GemstoneProductVariant)
-- weight_carat / weight_ratti are STRINGS in the app ("5.25", "6 ratti") — they
-- carry display formatting. Keep them text; casting to numeric loses that.
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_product_variants (
  id                   text primary key,
  product_id           text        not null references public.gemstone_products (id) on delete cascade,
  label                text        not null default '',
  weight_carat         text        not null default '',
  weight_ratti         text        not null default '',
  certification_level  text        not null default '',
  price                numeric(14,2) not null default 0,
  compare_at_price     numeric(14,2),
  stock_quantity       integer     not null default 0,
  sku                  text        not null default '',
  active               boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists gemstone_product_variants_product_idx on public.gemstone_product_variants (product_id, active);
create unique index if not exists gemstone_product_variants_sku_key
  on public.gemstone_product_variants (sku) where sku <> '';

-- -----------------------------------------------------------------------------
-- gemstone_product_images  (src/lib/gemstones.ts GemstoneProductImage)
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_product_images (
  id         text primary key,
  product_id text        not null references public.gemstone_products (id) on delete cascade,
  url        text        not null,
  alt        text        not null default '',
  sort_order integer     not null default 0,
  is_primary boolean     not null default false,
  created_at timestamptz not null default now()
);
create index if not exists gemstone_product_images_product_idx on public.gemstone_product_images (product_id, sort_order);
-- Firestore cannot express "one primary image per product" but the app assumes it;
-- Postgres can, and this catches a bad copy rather than a broken storefront.
create unique index if not exists gemstone_product_images_one_primary
  on public.gemstone_product_images (product_id) where is_primary;

-- -----------------------------------------------------------------------------
-- gemstone_coupons  (src/lib/gemstone-coupons.ts GemstoneCoupon)
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_coupons (
  id                 text primary key,
  code               text        not null,
  description        text        not null default '',
  discount_type      text        not null default 'percent' check (discount_type in ('percent','flat')),
  discount_value     numeric(14,2) not null default 0,
  min_order_amount   numeric(14,2) not null default 0,
  max_discount_amount numeric(14,2),
  usage_limit        integer,
  usage_count        integer     not null default 0,
  per_customer_limit integer,
  starts_at          timestamptz,
  expires_at         timestamptz,
  active             boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists gemstone_coupons_code_key on public.gemstone_coupons (code);

-- -----------------------------------------------------------------------------
-- gemstone_coupon_customer_usage  (src/lib/gemstone-orders.ts:38-40)
-- Firestore doc id is the literal composite `${couponCode}_${identifier}`, where
-- identifier is memberId or lowercased guest email. That composite IS the
-- per-customer limit enforcement, so preserve the id verbatim.
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_coupon_customer_usage (
  id                  text primary key,
  coupon_code         text        not null,
  customer_identifier text        not null,
  usage_count         integer     not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists gemstone_coupon_usage_code_idx on public.gemstone_coupon_customer_usage (coupon_code);

-- -----------------------------------------------------------------------------
-- gemstone_orders  (src/lib/gemstone-orders.ts:55 GemstoneOrder)
-- member_id is nullable because guest checkout is supported; guest_* holds the
-- contact details in that case.
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_orders (
  id                  text primary key,
  order_number        text        not null,
  member_id           text        references public.members (id) on delete set null,
  guest_name          text,
  guest_email         citext,
  guest_phone         text,
  shipping_name       text        not null default '',
  shipping_phone      text        not null default '',
  shipping_line1      text        not null default '',
  shipping_line2      text,
  shipping_city       text        not null default '',
  shipping_state      text        not null default '',
  shipping_pincode    text        not null default '',
  shipping_country    text        not null default 'IN',
  subtotal            numeric(14,2) not null default 0,
  discount            numeric(14,2) not null default 0,
  shipping_fee        numeric(14,2) not null default 0,
  tax                 numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  currency            text        not null default 'INR',
  coupon_code         text,
  status              text        not null default 'pending',
  payment_status      text        not null default 'unpaid',
  razorpay_order_id   text,
  razorpay_payment_id text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists gemstone_orders_order_number_key on public.gemstone_orders (order_number);
create index if not exists gemstone_orders_member_idx on public.gemstone_orders (member_id, created_at desc);
create unique index if not exists gemstone_orders_razorpay_order_key
  on public.gemstone_orders (razorpay_order_id) where razorpay_order_id is not null;

-- -----------------------------------------------------------------------------
-- gemstone_order_items  (src/lib/gemstone-orders.ts:86 GemstoneOrderItem)
-- product_id / variant_id are deliberately NOT foreign keys: an order must keep
-- its line items after a product is deleted, and the app already snapshots
-- product_name / variant_label for exactly this reason.
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_order_items (
  id            text primary key,
  order_id      text        not null references public.gemstone_orders (id) on delete cascade,
  product_id    text        not null,
  variant_id    text        not null,
  product_name  text        not null default '',
  variant_label text        not null default '',
  unit_price    numeric(14,2) not null default 0,
  quantity      integer     not null default 1 check (quantity > 0),
  line_total    numeric(14,2) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists gemstone_order_items_order_idx on public.gemstone_order_items (order_id);

-- -----------------------------------------------------------------------------
-- gemstone_reviews  (src/lib/gemstone-reviews.ts GemstoneReview)
-- image_urls is a delimited string in the app, not an array.
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_reviews (
  id            text primary key,
  product_id    text        not null references public.gemstone_products (id) on delete cascade,
  member_id     text        references public.members (id) on delete set null,
  order_id      text,
  reviewer_name text        not null default '',
  rating        smallint    not null check (rating between 1 and 5),
  title         text        not null default '',
  body          text        not null default '',
  image_urls    text        not null default '',
  status        text        not null default 'pending',
  helpful_votes integer     not null default 0,
  source        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists gemstone_reviews_product_status_idx on public.gemstone_reviews (product_id, status);

-- -----------------------------------------------------------------------------
-- gemstone_recommendations  (src/lib/gemstone-recommendations.ts)
-- category_slugs is a delimited string in the app.
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_recommendations (
  id             text primary key,
  member_id      text        references public.members (id) on delete set null,
  name           text        not null default '',
  birth_date     text,
  concern        text,
  zodiac_sign    text        not null default '',
  category_slugs text        not null default '',
  narrative      text        not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists gemstone_recommendations_member_idx on public.gemstone_recommendations (member_id, created_at desc);

-- -----------------------------------------------------------------------------
-- gemstone_wishlist  (src/lib/gemstone-wishlist.ts:13-33)
-- Firestore: members/{memberId}/wishlist/{productId}, body { productId, createdAt }.
-- Doc existence IS the wishlist entry, so (member_id, product_id) must be unique.
-- -----------------------------------------------------------------------------
create table if not exists public.gemstone_wishlist (
  id         text primary key,
  member_id  text        not null references public.members (id) on delete cascade,
  product_id text        not null references public.gemstone_products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (member_id, product_id)
);
create index if not exists gemstone_wishlist_product_idx on public.gemstone_wishlist (product_id);

-- -----------------------------------------------------------------------------
-- member_favorites  (src/lib/marketplace.ts:140-143)
-- Firestore: members/{memberId}/favorites/{practitionerId}. Note this is the
-- PRACTITIONER favourites list, not a gemstone one — the `favorites` collection
-- name is shared but the parent is members and the child key is a practitioner.
-- Doc existence IS the favourite.
-- -----------------------------------------------------------------------------
create table if not exists public.member_favorites (
  id              text primary key,
  member_id       text        not null references public.members (id) on delete cascade,
  practitioner_id text        not null references public.practitioners (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (member_id, practitioner_id)
);

-- -----------------------------------------------------------------------------
-- custom_pages  (src/lib/custom-pages.ts CustomPage)
-- blocks is a PageBlock[] — heterogeneous discriminated union, so jsonb is the
-- faithful representation. Do not try to normalise it into rows.
-- -----------------------------------------------------------------------------
create table if not exists public.custom_pages (
  id              text primary key,
  slug            text        not null,
  title           text        not null default '',
  meta_description text       not null default '',
  blocks          jsonb       not null default '[]'::jsonb,
  published       boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists custom_pages_slug_key on public.custom_pages (slug);

-- -----------------------------------------------------------------------------
-- site_content  (src/lib/site-content.ts)
-- A handful of singleton config docs (home hero, footer). Shapes are
-- HomeHeroContent / FooterContent, but they are edited as a unit in the admin
-- studio and never queried by field, so a jsonb document is the honest mapping.
-- -----------------------------------------------------------------------------
create table if not exists public.site_content (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- studio_settings  (src/lib/studio-settings.ts StudioSettings)
-- Singleton document, id == 'main'. Modelled as real columns because the type is
-- explicit and the booking engine reads timezone / booking_lead_minutes / gst_rate
-- directly. updated_at is an ISO STRING in the app (deliberate — see the comment
-- at src/lib/studio-settings.ts:16) so it stays text, not timestamptz.
-- -----------------------------------------------------------------------------
create table if not exists public.studio_settings (
  id                  text primary key,
  studio_name         text        not null default 'Adi Jyotish Guru',
  support_email       text        not null default 'support@adijyotishguru.com',
  timezone            text        not null default 'Asia/Kolkata',
  currency            text        not null default 'INR',
  cancellation_hours  integer     not null default 24,
  booking_lead_minutes integer    not null default 15,
  reply_sla_hours     integer     not null default 24,
  gst_rate            numeric(6,3) not null default 18,
  gstin               text,
  updated_at          text
);

-- -----------------------------------------------------------------------------
-- promo_banner  (src/lib/promo-banner.ts PromoBanner)
-- updated_at is an ISO string here too, for the same unstable_cache reason.
-- -----------------------------------------------------------------------------
create table if not exists public.promo_banner (
  id          text primary key,
  enabled     boolean     not null default false,
  message     text        not null default '',
  cta_label   text,
  cta_href    text,
  source      text        not null default 'manual' check (source in ('manual','auto')),
  festival_key text,
  updated_at  text
);

-- -----------------------------------------------------------------------------
-- daily_horoscopes  (src/lib/horoscopes.ts:160 DailyHoroscope)
-- `date` is a YYYY-MM-DD string in the app and is used as part of the doc id.
-- Kept as text so the id and the column stay consistent after the copy.
-- -----------------------------------------------------------------------------
create table if not exists public.daily_horoscopes (
  id         text primary key,
  sign       text        not null,
  date       text        not null,
  content    text        not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists daily_horoscopes_sign_date_key on public.daily_horoscopes (sign, date);

do $$
declare t text;
begin
  foreach t in array array[
    'gemstone_categories','gemstone_products','gemstone_product_variants',
    'gemstone_product_images','gemstone_coupons','gemstone_coupon_customer_usage',
    'gemstone_orders','gemstone_order_items','gemstone_reviews',
    'gemstone_recommendations','gemstone_wishlist','member_favorites',
    'custom_pages','site_content','studio_settings','promo_banner','daily_horoscopes'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
