import {
  boolean,
  index,
  integer,
  pgTable,
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
  active: boolean("active").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
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
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const studioSettings = pgTable("studio_settings", {
  id: integer("id").primaryKey().default(1),
  studioName: varchar("studio_name", { length: 120 }).notNull().default("Jyotish Studio"),
  supportEmail: varchar("support_email", { length: 180 }).notNull().default("support@jyotish.studio"),
  timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Kolkata"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  cancellationHours: integer("cancellation_hours").notNull().default(24),
  bookingLeadMinutes: integer("booking_lead_minutes").notNull().default(15),
  replySlaHours: integer("reply_sla_hours").notNull().default(24),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
export type AdminInvite = typeof adminInvites.$inferSelect;
export type StudioSettings = typeof studioSettings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
