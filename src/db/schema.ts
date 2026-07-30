import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  category: varchar("category", { length: 60 }).notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull().default(0),
  duration: integer("duration").notNull().default(30),
  icon: varchar("icon", { length: 40 }).notNull().default("sparkles"),
  active: boolean("active").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const practitioners = pgTable("practitioners", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  email: varchar("email", { length: 180 }).notNull().unique(),
  title: varchar("title", { length: 120 }).notNull().default("Vedic Astrologer"),
  bio: text("bio").notNull(),
  specialties: text("specialties").notNull(),
  languages: varchar("languages", { length: 240 }).notNull().default("English, Hindi"),
  consultationModes: varchar("consultation_modes", { length: 160 }).notNull().default("Video, Audio, Chat"),
  experienceYears: integer("experience_years").notNull().default(5),
  verified: boolean("verified").notNull().default(false),
  verificationLevel: varchar("verification_level", { length: 40 }).notNull().default("reviewed"),
  photoUrl: text("photo_url"),
  online: boolean("online").notNull().default(false),
  chatRatePerMinute: integer("chat_rate_per_minute").notNull().default(15),
  active: boolean("active").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  passwordHash: text("password_hash"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const practitionerSessions = pgTable("practitioner_sessions", {
  id: serial("id").primaryKey(),
  practitionerId: integer("practitioner_id").notNull().references(() => practitioners.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("practitioner_sessions_practitioner_id_idx").on(table.practitionerId),
]);

export const practitionerInvites = pgTable("practitioner_invites", {
  id: serial("id").primaryKey(),
  practitionerId: integer("practitioner_id").notNull().references(() => practitioners.id, { onDelete: "cascade" }).unique(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  invitedBy: integer("invited_by").references(() => adminUsers.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const practitionerPayouts = pgTable("practitioner_payouts", {
  id: serial("id").primaryKey(),
  practitionerId: integer("practitioner_id").notNull().references(() => practitioners.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  status: varchar("status", { length: 20 }).notNull().default("requested"),
  notes: text("notes"),
  adminNotes: text("admin_notes"),
  processedBy: integer("processed_by").references(() => adminUsers.id, { onDelete: "set null" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("practitioner_payouts_practitioner_id_idx").on(table.practitionerId),
]);

export const availabilityRules = pgTable("availability_rules", {
  id: serial("id").primaryKey(),
  practitionerId: integer("practitioner_id").notNull().references(() => practitioners.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  active: boolean("active").notNull().default(true),
}, (table) => [
  index("availability_practitioner_weekday_idx").on(table.practitionerId, table.weekday),
]);

export const practitionerTimeOff = pgTable("practitioner_time_off", {
  id: serial("id").primaryKey(),
  practitionerId: integer("practitioner_id").notNull().references(() => practitioners.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: varchar("reason", { length: 180 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("practitioner_time_off_range_idx").on(table.practitionerId, table.startsAt, table.endsAt),
]);

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 24 }).notNull().unique(),
  serviceId: integer("service_id").references(() => services.id, { onDelete: "set null" }),
  serviceTitle: varchar("service_title", { length: 120 }).notNull(),
  servicePrice: integer("service_price").notNull(),
  serviceDuration: integer("service_duration").notNull().default(30),
  practitionerId: integer("practitioner_id").references(() => practitioners.id, { onDelete: "set null" }),
  practitionerName: varchar("practitioner_name", { length: 120 }),
  clientName: varchar("client_name", { length: 120 }).notNull(),
  clientEmail: varchar("client_email", { length: 180 }).notNull(),
  clientPhone: varchar("client_phone", { length: 40 }),
  birthDate: varchar("birth_date", { length: 10 }).notNull(),
  birthTime: varchar("birth_time", { length: 8 }).notNull(),
  birthPlace: varchar("birth_place", { length: 180 }).notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  paymentStatus: varchar("payment_status", { length: 30 }).notNull().default("unpaid"),
  kundliSummary: text("kundli_summary"),
  kundliGeneratedAt: timestamp("kundli_generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("bookings_practitioner_start_unique").on(table.practitionerId, table.scheduledAt),
  index("bookings_client_email_idx").on(table.clientEmail),
  index("bookings_scheduled_at_idx").on(table.scheduledAt),
  index("bookings_status_idx").on(table.status),
]);

export const memberUsers = pgTable("member_users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 180 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: varchar("phone", { length: 40 }),
  birthDate: varchar("birth_date", { length: 10 }),
  birthTime: varchar("birth_time", { length: 8 }),
  birthPlace: varchar("birth_place", { length: 180 }),
  plan: varchar("plan", { length: 30 }).notNull().default("member"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const favoritePractitioners = pgTable("favorite_practitioners", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => memberUsers.id, { onDelete: "cascade" }),
  practitionerId: integer("practitioner_id").notNull().references(() => practitioners.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("favorite_member_practitioner_unique").on(table.memberId, table.practitionerId),
  index("favorite_practitioner_idx").on(table.practitionerId),
]);

export const practitionerReviews = pgTable("practitioner_reviews", {
  id: serial("id").primaryKey(),
  practitionerId: integer("practitioner_id").notNull().references(() => practitioners.id, { onDelete: "cascade" }),
  memberId: integer("member_id").references(() => memberUsers.id, { onDelete: "set null" }),
  bookingId: integer("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }).unique(),
  reviewerName: varchar("reviewer_name", { length: 120 }).notNull(),
  rating: integer("rating").notNull(),
  clarity: integer("clarity").notNull(),
  empathy: integer("empathy").notNull(),
  usefulness: integer("usefulness").notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("practitioner_reviews_public_idx").on(table.practitionerId, table.status, table.createdAt),
  index("practitioner_reviews_member_idx").on(table.memberId),
]);

export const memberSessions = pgTable("member_sessions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => memberUsers.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("member_sessions_member_id_idx").on(table.memberId),
]);

export const messageThreads = pgTable("message_threads", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => memberUsers.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 160 }).notNull(),
  category: varchar("category", { length: 40 }).notNull().default("support"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("message_threads_member_last_idx").on(table.memberId, table.lastMessageAt),
  index("message_threads_booking_id_idx").on(table.bookingId),
]);

export const threadMessages = pgTable("thread_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => messageThreads.id, { onDelete: "cascade" }),
  senderType: varchar("sender_type", { length: 20 }).notNull(),
  senderName: varchar("sender_name", { length: 120 }).notNull(),
  body: text("body").notNull(),
  readByMember: boolean("read_by_member").notNull().default(false),
  readByAdmin: boolean("read_by_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("thread_messages_thread_created_idx").on(table.threadId, table.createdAt),
  index("thread_messages_admin_unread_idx").on(table.senderType, table.readByAdmin),
  index("thread_messages_member_unread_idx").on(table.readByMember),
]);

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 32 }).notNull().unique(),
  bookingId: integer("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }).unique(),
  memberId: integer("member_id").references(() => memberUsers.id, { onDelete: "set null" }),
  customerName: varchar("customer_name", { length: 120 }).notNull(),
  customerEmail: varchar("customer_email", { length: 180 }).notNull(),
  description: varchar("description", { length: 180 }).notNull(),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  status: varchar("status", { length: 24 }).notNull().default("open"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("invoices_customer_email_idx").on(table.customerEmail),
  index("invoices_member_id_idx").on(table.memberId),
  index("invoices_status_idx").on(table.status),
]);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  provider: varchar("provider", { length: 24 }).notNull().default("manual"),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  providerSessionId: varchar("provider_session_id", { length: 180 }).unique(),
  paymentIntentId: varchar("payment_intent_id", { length: 180 }),
  refundId: varchar("refund_id", { length: 180 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payments_invoice_created_idx").on(table.invoiceId, table.createdAt),
  index("payments_booking_id_idx").on(table.bookingId),
  index("payments_payment_intent_idx").on(table.paymentIntentId),
]);

export const razorpayEvents = pgTable("razorpay_events", {
  id: serial("id").primaryKey(),
  razorpayEventId: varchar("razorpay_event_id", { length: 180 }).notNull().unique(),
  type: varchar("type", { length: 100 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authRateLimits = pgTable("auth_rate_limits", {
  id: serial("id").primaryKey(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 180 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 30 }).notNull().default("owner"),
  active: boolean("active").notNull().default(true),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpBackupCodes: jsonb("totp_backup_codes").$type<string[]>(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const admin2faChallenges = pgTable("admin_2fa_challenges", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("admin_2fa_challenges_admin_id_idx").on(table.adminId),
]);

export const adminSessions = pgTable("admin_sessions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("admin_sessions_admin_id_idx").on(table.adminId),
]);

export const adminInvites = pgTable("admin_invites", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 180 }).notNull(),
  role: varchar("role", { length: 30 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  invitedBy: integer("invited_by").references(() => adminUsers.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("admin_invites_email_idx").on(table.email),
  index("admin_invites_expiry_idx").on(table.expiresAt, table.acceptedAt),
]);

export const adminRoles = pgTable("admin_roles", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studioSettings = pgTable("studio_settings", {
  id: integer("id").primaryKey().default(1),
  studioName: varchar("studio_name", { length: 120 }).notNull().default("Jyotish Studio"),
  supportEmail: varchar("support_email", { length: 180 }).notNull().default("support@jyotish.studio"),
  timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Kolkata"),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  cancellationHours: integer("cancellation_hours").notNull().default(24),
  bookingLeadMinutes: integer("booking_lead_minutes").notNull().default(15),
  replySlaHours: integer("reply_sla_hours").notNull().default(24),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const membershipPlans = pgTable("membership_plans", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  tagline: varchar("tagline", { length: 160 }).notNull().default(""),
  description: text("description").notNull().default(""),
  priceMonthly: integer("price_monthly").notNull().default(0),
  priceYearly: integer("price_yearly"),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  features: text("features").notNull().default(""),
  sessionDiscountPercent: integer("session_discount_percent").notNull().default(0),
  highlighted: boolean("highlighted").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  razorpayPlanIdMonthly: varchar("razorpay_plan_id_monthly", { length: 60 }),
  razorpayPlanIdYearly: varchar("razorpay_plan_id_yearly", { length: 60 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("membership_plans_sort_idx").on(table.sortOrder),
]);

export const memberSubscriptions = pgTable("member_subscriptions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => memberUsers.id, { onDelete: "cascade" }).unique(),
  planId: integer("plan_id").notNull().references(() => membershipPlans.id, { onDelete: "restrict" }),
  billingInterval: varchar("billing_interval", { length: 10 }).notNull().default("monthly"),
  status: varchar("status", { length: 20 }).notNull().default("created"),
  razorpaySubscriptionId: varchar("razorpay_subscription_id", { length: 60 }).unique(),
  razorpayCustomerId: varchar("razorpay_customer_id", { length: 60 }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("member_subscriptions_status_idx").on(table.status),
  index("member_subscriptions_plan_idx").on(table.planId),
]);

export const subscriptionInvoices = pgTable("subscription_invoices", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => memberSubscriptions.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => memberUsers.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("paid"),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 60 }).unique(),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("subscription_invoices_member_created_idx").on(table.memberId, table.createdAt),
  index("subscription_invoices_subscription_idx").on(table.subscriptionId),
]);

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => memberUsers.id, { onDelete: "cascade" }).unique(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  balance: integer("balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const walletEntries = pgTable("wallet_entries", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  referenceType: varchar("reference_type", { length: 30 }),
  referenceId: varchar("reference_id", { length: 60 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 60 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wallet_entries_wallet_created_idx").on(table.walletId, table.createdAt),
]);

export const walletHolds = pgTable("wallet_holds", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wallet_holds_wallet_status_idx").on(table.walletId, table.status),
]);

export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => memberUsers.id, { onDelete: "cascade" }),
  practitionerId: integer("practitioner_id").notNull().references(() => practitioners.id, { onDelete: "cascade" }),
  walletHoldId: integer("wallet_hold_id").notNull().references(() => walletHolds.id, { onDelete: "restrict" }),
  ratePerMinute: integer("rate_per_minute").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  capturedAmount: integer("captured_amount"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("chat_sessions_member_idx").on(table.memberId, table.status),
  index("chat_sessions_practitioner_idx").on(table.practitionerId, table.status),
]);

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  senderType: varchar("sender_type", { length: 20 }).notNull(),
  senderName: varchar("sender_name", { length: 120 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("chat_messages_session_created_idx").on(table.sessionId, table.createdAt),
]);

export const aiReadings = pgTable("ai_readings", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => memberUsers.id, { onDelete: "cascade" }),
  readingType: varchar("reading_type", { length: 20 }).notNull().default("question"),
  clientName: varchar("client_name", { length: 120 }).notNull(),
  birthDate: varchar("birth_date", { length: 20 }).notNull(),
  birthTime: varchar("birth_time", { length: 20 }).notNull(),
  birthPlace: varchar("birth_place", { length: 160 }).notNull(),
  question: text("question"),
  price: integer("price").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("INR"),
  status: varchar("status", { length: 20 }).notNull().default("pending_payment"),
  razorpayOrderId: varchar("razorpay_order_id", { length: 80 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 80 }),
  answer: text("answer"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ai_readings_member_idx").on(table.memberId, table.createdAt),
  uniqueIndex("ai_readings_razorpay_payment_id_unique").on(table.razorpayPaymentId),
]);

export const dailyHoroscopes = pgTable("daily_horoscopes", {
  id: serial("id").primaryKey(),
  sign: varchar("sign", { length: 12 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("daily_horoscopes_sign_date_unique").on(table.sign, table.date),
]);

export const kundliMatches = pgTable("kundli_matches", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => memberUsers.id, { onDelete: "set null" }),
  personAName: varchar("person_a_name", { length: 120 }).notNull(),
  personABirthDate: varchar("person_a_birth_date", { length: 10 }).notNull(),
  personABirthTime: varchar("person_a_birth_time", { length: 5 }).notNull(),
  personABirthPlace: varchar("person_a_birth_place", { length: 160 }).notNull(),
  personBName: varchar("person_b_name", { length: 120 }).notNull(),
  personBBirthDate: varchar("person_b_birth_date", { length: 10 }).notNull(),
  personBBirthTime: varchar("person_b_birth_time", { length: 5 }).notNull(),
  personBBirthPlace: varchar("person_b_birth_place", { length: 160 }).notNull(),
  compatibilityScore: real("compatibility_score").notNull(),
  breakdown: jsonb("breakdown").$type<{ varna: number; vashya: number; tara: number; yoni: number; grahaMaitri: number; gana: number; bhakoot: number; nadi: number }>().notNull(),
  narrative: text("narrative").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("kundli_matches_created_idx").on(table.createdAt),
]);

export const numerologyReadings = pgTable("numerology_readings", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => memberUsers.id, { onDelete: "set null" }),
  name: varchar("name", { length: 120 }).notNull(),
  birthDate: varchar("birth_date", { length: 10 }).notNull(),
  lifePathNumber: integer("life_path_number").notNull(),
  destinyNumber: integer("destiny_number").notNull(),
  narrative: text("narrative").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("numerology_readings_created_idx").on(table.createdAt),
]);

export const gemstoneCategories = pgTable("gemstone_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gemstoneProducts = pgTable("gemstone_products", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => gemstoneCategories.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  shortDescription: varchar("short_description", { length: 300 }).notNull().default(""),
  description: text("description").notNull().default(""),
  benefits: text("benefits").notNull().default(""),
  whoShouldWear: text("who_should_wear").notNull().default(""),
  recommendedZodiac: varchar("recommended_zodiac", { length: 200 }).notNull().default(""),
  recommendedPlanets: varchar("recommended_planets", { length: 200 }).notNull().default(""),
  origin: varchar("origin", { length: 120 }).notNull().default(""),
  color: varchar("color", { length: 80 }).notNull().default(""),
  treatment: varchar("treatment", { length: 120 }).notNull().default(""),
  certification: varchar("certification", { length: 120 }).notNull().default(""),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  sku: varchar("sku", { length: 60 }).notNull().unique(),
  featured: boolean("featured").notNull().default(false),
  trending: boolean("trending").notNull().default(false),
  bestseller: boolean("bestseller").notNull().default(false),
  active: boolean("active").notNull().default(true),
  metaTitle: varchar("meta_title", { length: 160 }).notNull().default(""),
  metaDescription: varchar("meta_description", { length: 300 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("gemstone_products_category_idx").on(table.categoryId, table.active),
]);

export const gemstoneProductImages = pgTable("gemstone_product_images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => gemstoneProducts.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 200 }).notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("gemstone_product_images_product_idx").on(table.productId, table.sortOrder),
]);

export const gemstoneProductVariants = pgTable("gemstone_product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => gemstoneProducts.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }).notNull(),
  weightCarat: varchar("weight_carat", { length: 20 }).notNull().default(""),
  weightRatti: varchar("weight_ratti", { length: 20 }).notNull().default(""),
  certificationLevel: varchar("certification_level", { length: 80 }).notNull().default(""),
  price: integer("price").notNull(),
  compareAtPrice: integer("compare_at_price"),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  sku: varchar("sku", { length: 60 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("gemstone_product_variants_product_idx").on(table.productId, table.active),
]);

export const gemstoneOrders = pgTable("gemstone_orders", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("order_number", { length: 30 }).notNull().unique(),
  memberId: integer("member_id").references(() => memberUsers.id, { onDelete: "set null" }),
  guestName: varchar("guest_name", { length: 120 }),
  guestEmail: varchar("guest_email", { length: 180 }),
  guestPhone: varchar("guest_phone", { length: 40 }),
  shippingName: varchar("shipping_name", { length: 120 }).notNull(),
  shippingPhone: varchar("shipping_phone", { length: 40 }).notNull(),
  shippingLine1: varchar("shipping_line1", { length: 200 }).notNull(),
  shippingLine2: varchar("shipping_line2", { length: 200 }),
  shippingCity: varchar("shipping_city", { length: 100 }).notNull(),
  shippingState: varchar("shipping_state", { length: 100 }).notNull(),
  shippingPincode: varchar("shipping_pincode", { length: 12 }).notNull(),
  shippingCountry: varchar("shipping_country", { length: 80 }).notNull().default("India"),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").notNull().default(0),
  shippingFee: integer("shipping_fee").notNull().default(0),
  tax: integer("tax").notNull().default(0),
  total: integer("total").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  couponCode: varchar("coupon_code", { length: 40 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  paymentStatus: varchar("payment_status", { length: 20 }).notNull().default("pending"),
  razorpayOrderId: varchar("razorpay_order_id", { length: 80 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 80 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("gemstone_orders_member_idx").on(table.memberId, table.createdAt),
  index("gemstone_orders_status_idx").on(table.status),
  uniqueIndex("gemstone_orders_razorpay_payment_id_unique").on(table.razorpayPaymentId),
]);

export const gemstoneOrderItems = pgTable("gemstone_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => gemstoneOrders.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => gemstoneProducts.id, { onDelete: "restrict" }),
  variantId: integer("variant_id").notNull().references(() => gemstoneProductVariants.id, { onDelete: "restrict" }),
  productName: varchar("product_name", { length: 160 }).notNull(),
  variantLabel: varchar("variant_label", { length: 120 }).notNull(),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotal: integer("line_total").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("gemstone_order_items_order_idx").on(table.orderId),
]);

export const gemstoneWishlist = pgTable("gemstone_wishlist", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => memberUsers.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => gemstoneProducts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("gemstone_wishlist_member_product_unique").on(table.memberId, table.productId),
]);

export const gemstoneReviews = pgTable("gemstone_reviews", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => gemstoneProducts.id, { onDelete: "cascade" }),
  memberId: integer("member_id").references(() => memberUsers.id, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => gemstoneOrders.id, { onDelete: "set null" }),
  reviewerName: varchar("reviewer_name", { length: 120 }).notNull(),
  rating: integer("rating").notNull(),
  title: varchar("title", { length: 160 }).notNull().default(""),
  body: text("body").notNull(),
  imageUrls: text("image_urls").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  helpfulVotes: integer("helpful_votes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("gemstone_reviews_product_status_idx").on(table.productId, table.status),
]);

export const gemstoneCoupons = pgTable("gemstone_coupons", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  description: varchar("description", { length: 200 }).notNull().default(""),
  discountType: varchar("discount_type", { length: 10 }).notNull().default("percent"),
  discountValue: integer("discount_value").notNull(),
  minOrderAmount: integer("min_order_amount").notNull().default(0),
  maxDiscountAmount: integer("max_discount_amount"),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  perCustomerLimit: integer("per_customer_limit"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gemstoneRecommendations = pgTable("gemstone_recommendations", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => memberUsers.id, { onDelete: "set null" }),
  name: varchar("name", { length: 120 }).notNull(),
  birthDate: varchar("birth_date", { length: 10 }).notNull(),
  concern: varchar("concern", { length: 300 }),
  zodiacSign: varchar("zodiac_sign", { length: 12 }).notNull(),
  categorySlugs: varchar("category_slugs", { length: 200 }).notNull().default(""),
  narrative: text("narrative").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("gemstone_recommendations_created_idx").on(table.createdAt),
]);

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  id: serial("id").primaryKey(),
  bucketKey: varchar("bucket_key", { length: 160 }).notNull().unique(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("rate_limit_buckets_window_idx").on(table.windowStartedAt),
]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  recipientType: varchar("recipient_type", { length: 20 }).notNull(),
  recipientId: integer("recipient_id").notNull(),
  type: varchar("type", { length: 60 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body"),
  link: varchar("link", { length: 300 }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("notifications_recipient_idx").on(table.recipientType, table.recipientId, table.createdAt),
]);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
  adminName: varchar("admin_name", { length: 120 }).notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 80 }),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_logs_created_at_idx").on(table.createdAt),
  index("audit_logs_admin_id_idx").on(table.adminId),
]);

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type Practitioner = typeof practitioners.$inferSelect;
export type PractitionerSession = typeof practitionerSessions.$inferSelect;
export type PractitionerInvite = typeof practitionerInvites.$inferSelect;
export type PractitionerPayout = typeof practitionerPayouts.$inferSelect;
export type NewPractitionerPayout = typeof practitionerPayouts.$inferInsert;
export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type PractitionerTimeOff = typeof practitionerTimeOff.$inferSelect;
export type PractitionerReview = typeof practitionerReviews.$inferSelect;
export type FavoritePractitioner = typeof favoritePractitioners.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type MemberUser = typeof memberUsers.$inferSelect;
export type MessageThread = typeof messageThreads.$inferSelect;
export type ThreadMessage = typeof threadMessages.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type Admin2faChallenge = typeof admin2faChallenges.$inferSelect;
export type AdminRole = typeof adminRoles.$inferSelect;
export type NewAdminRole = typeof adminRoles.$inferInsert;
export type AdminInvite = typeof adminInvites.$inferSelect;
export type StudioSettings = typeof studioSettings.$inferSelect;
export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type MembershipPlan = typeof membershipPlans.$inferSelect;
export type NewMembershipPlan = typeof membershipPlans.$inferInsert;
export type MemberSubscription = typeof memberSubscriptions.$inferSelect;
export type SubscriptionInvoice = typeof subscriptionInvoices.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type WalletEntry = typeof walletEntries.$inferSelect;
export type WalletHold = typeof walletHolds.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type AiReading = typeof aiReadings.$inferSelect;
export type NewAiReading = typeof aiReadings.$inferInsert;
export type DailyHoroscope = typeof dailyHoroscopes.$inferSelect;
export type GemstoneCategory = typeof gemstoneCategories.$inferSelect;
export type NewGemstoneCategory = typeof gemstoneCategories.$inferInsert;
export type GemstoneProduct = typeof gemstoneProducts.$inferSelect;
export type NewGemstoneProduct = typeof gemstoneProducts.$inferInsert;
export type GemstoneProductImage = typeof gemstoneProductImages.$inferSelect;
export type GemstoneProductVariant = typeof gemstoneProductVariants.$inferSelect;
export type NewGemstoneProductVariant = typeof gemstoneProductVariants.$inferInsert;
export type GemstoneOrder = typeof gemstoneOrders.$inferSelect;
export type GemstoneOrderItem = typeof gemstoneOrderItems.$inferSelect;
export type GemstoneWishlistItem = typeof gemstoneWishlist.$inferSelect;
export type GemstoneReview = typeof gemstoneReviews.$inferSelect;
export type GemstoneCoupon = typeof gemstoneCoupons.$inferSelect;
export type NewGemstoneCoupon = typeof gemstoneCoupons.$inferInsert;
export type GemstoneRecommendation = typeof gemstoneRecommendations.$inferSelect;
export type KundliMatch = typeof kundliMatches.$inferSelect;
export type NumerologyReading = typeof numerologyReadings.$inferSelect;
