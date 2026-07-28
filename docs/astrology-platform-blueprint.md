# Jyotish AI Platform — Product, Marketplace, AI, and Architecture Blueprint

**Research date:** July 2026  
**Reference scope:** Publicly observable flows and indexed pages from Astrotalk. No proprietary source code, private APIs, visual assets, copy, or internal systems were used.  
**Product direction:** A distinct premium Vedic intelligence platform combining a trusted expert marketplace, deterministic astrology computation, explainable AI, secure payments, and a calm Apple/Linear/Stripe-grade experience.

---

## 1. Executive Summary

Public research shows Astrotalk uses a high-volume marketplace model built around instant access to astrologers, free-first conversion, per-minute chat/call billing, wallet recharge, social proof, SEO landing pages, horoscope utilities, live sessions, content, and spiritual commerce. Its strongest business loops are:

1. **Free utility → account/profile capture → paid consultation.**
2. **Large astrologer supply → filters/online state → instant chat/call.**
3. **Wallet recharge → metered session → repeat consultation.**
4. **Daily horoscope/content → daily return habit.**
5. **Review volume and verification messaging → trust.**
6. **Long-tail city, sign, muhurat, kundli, and blog pages → organic acquisition.**

The opportunity is not to reproduce a crowded marketplace interface. Jyotish should differentiate with:

- Explainable AI before and after every expert session.
- A persistent personal cosmic model rather than disconnected predictions.
- Scheduled, instant, async, and AI consultation modes in one timeline.
- Transparent fixed prices and per-minute pricing with visible spend controls.
- Higher-trust practitioner verification and performance governance.
- Premium editorial design, accessibility, speed, and privacy.
- PostgreSQL-backed financial and booking integrity rather than eventually consistent core ledgers.

---

## 2. Public Feature Inventory

### Acquisition and trust

- Home page with online astrologer count, free consultation CTA, platform metrics, services, horoscope sample, reviews, app promotion, educational content, FAQs, and deep footer.
- Login, signup, OTP/mobile entry, app-download prompts, and free-first offers.
- Verification claims, ratings, review volume, orders completed, years of experience, languages, skills, and online status.
- Testimonials, media mentions, promotional banners, coupons, first-session offers, and app-install campaigns.

### Expert marketplace

- Chat-with-astrologer and talk-to-astrologer listing pages.
- Astrologer cards with picture, name, skill, language, experience, price/minute, rating, orders, availability, chat/call actions, and promotional price.
- Search, category/skill/language/price/experience filters, online availability, sorting, and pagination/infinite lists.
- Location/city SEO directories for astrologers.
- Astrologer profiles with biography, specialties, consultation mode, pricing, ratings, reviews, and history/reconnect behavior.
- Chat, voice call, video call, query/report orders, and live astrologer sessions.

### Astrology utilities and content

- Free Kundli and chart generation.
- Kundli matching / Ashtakoota matching.
- Daily, yesterday, tomorrow, weekly, monthly, yearly, and love horoscopes.
- Panchang and festival calendars.
- Muhurat pages for marriage, property, vehicle, business, travel, education, medical and ceremonies.
- Numerology, tarot, vastu, zodiac, nakshatra, dosha, yoga, mantra, remedies, eclipse, and compatibility content.
- Blogs/articles, long-tail educational SEO pages, FAQs, reviews, and topic/category hubs.
- Spiritual store / Astromall products and service reports.

### Commerce and retention

- Wallet recharge and per-minute deductions.
- UPI/card/net-banking payment support and promotional recharge bonuses.
- Transaction/order history and reconnect with previous astrologers.
- Refund/cancellation policy, customer support, and dispute handling.
- Coupons, rewards, referrals, memberships, offers, and first-session incentives.
- Push/app notifications and recurring horoscope/content reminders.

### Supply-side operations

- Astrologer onboarding, knowledge/qualification checks, interview, audit/probation, training, quality tiers, and removal/reinstatement logic.
- Online status, schedules, call/chat acceptance, session delivery, performance tracking, earnings, commissions, and payouts.
- Admin review, moderation, refunds, pricing, promotions, quality controls, and customer support.

### SEO footprint observed

- Page, astrologer, and blog sitemap segmentation.
- Long-tail city astrologer directories.
- Deep internal linking across horoscope, muhurat, kundli, astrology topics, store, and blogs.
- FAQ-rich copy and structured content suitable for FAQ and article schema.
- Indexable practitioner pages and topic hubs.

---

## 3. UX Audit

### What works

- The main value proposition is immediate and easy to understand.
- Free-first offers reduce uncertainty.
- Online state and response time create urgency.
- Visible social proof lowers marketplace trust friction.
- Multiple consultation modes support different comfort and spend levels.
- Utilities and content repeatedly feed the consultation funnel.
- Purchase history makes expert reconnection easy.

### Observed category-level problems to avoid

- Marketplace density can create choice paralysis.
- Price/minute obscures final session cost without budget controls.
- Promotional visual noise can reduce premium trust.
- Generic predictions do not build a persistent personal model.
- Chat/call flows can feel transactional instead of continuous.
- Content-heavy pages can hurt readability and Core Web Vitals.
- Wallet balances can create refund/support complexity.
- Ratings without methodology may feel inflated.
- Instant consultation prioritizes availability over practitioner fit.

### Jyotish improvements

- AI-assisted expert matching based on intent, chart context, communication style, language, budget, and schedule.
- “Why this guide” explanations rather than opaque ranking.
- Fixed-price scheduled readings plus optional metered instant sessions.
- Budget cap, low-balance warning, and explicit expected session cost.
- Unified Journey timeline: AI insight → expert session → transcript → action plan → follow-up.
- Explainable chart evidence attached to every AI and practitioner claim.
- Calm editorial interfaces with progressive disclosure instead of banner density.
- Transparent verification badge details and review provenance.
- Context-preserving conversation and report history.

---

## 4. Proposed Information Architecture

### Public

- `/` — premium home
- `/astrologers` — expert marketplace
- `/astrologers/[slug]` — expert profile
- `/book` — scheduled consultation
- `/live` — live sessions and upcoming events
- `/ai` — AI Vedic Intelligence overview
- `/kundli` — birth chart generator
- `/kundli/[chartId]` — share-controlled chart
- `/match` — compatibility
- `/horoscope/[period]/[sign]`
- `/panchang/[date]/[location]`
- `/muhurat/[type]/[location]/[year]`
- `/numerology`, `/tarot`, `/transits`, `/dasha`
- `/reports/[type]`
- `/learn`, `/learn/[category]`, `/learn/[slug]`
- `/store`, `/store/[slug]`
- `/pricing`, `/about`, `/verification`, `/help`, `/faq`

### Member

- `/dashboard` — cosmic overview
- `/dashboard/chart` — complete chart and divisional charts
- `/dashboard/timeline` — Dasha/transit timeline
- `/dashboard/ai` — AI analysis and conversations
- `/dashboard/reports` — generated reports/PDFs
- `/dashboard/consultations` — upcoming/history
- `/dashboard/messages` — studio/expert inbox
- `/dashboard/billing` — invoices and receipts
- `/dashboard/wallet` — balance and ledger
- `/dashboard/rewards` — referrals, coupons, streaks
- `/dashboard/notifications`
- `/dashboard/settings`

### Practitioner

- `/practitioner` — daily operations
- `/practitioner/onboarding` — profile, KYC, qualification, agreement
- `/practitioner/availability`
- `/practitioner/consultations`
- `/practitioner/chat/[sessionId]`
- `/practitioner/call/[sessionId]`
- `/practitioner/live`
- `/practitioner/earnings`
- `/practitioner/withdrawals`
- `/practitioner/reviews`
- `/practitioner/analytics`

### Administrator

Already implemented: Overview, Services, Members, Bookings, Schedule, Billing, Messages, Insights, Activity, Settings, Team. Future additions: Verification/KYC, Live moderation, Content/SEO, Store, Offers, Wallet/commission, Notifications, AI safety, Reviews, Disputes.

---

## 5. Feature Matrix

| Feature | Reference behavior | Main problem | Jyotish improved version | Priority | Difficulty | Estimate | Revenue impact |
|---|---|---|---|---|---|---|---|
| Expert listing | Dense cards, online status, price/min | Choice overload | Intent-based matching, fixed + metered modes, fit explanation | P0 | M | 2 sprints | Very high |
| Expert profile | Skills, ratings, orders | Trust can be shallow | Verification timeline, methods, evidence-based reviews, intro media | P0 | M | 2 sprints | High |
| Scheduled booking | Availability and purchase | Generic slots/conflicts | Timezone-aware real availability and DB conflict guards | Done | H | — | High |
| Instant chat | Wallet-funded per-minute chat | Spend uncertainty | Budget cap, queue ETA, transcript, AI handoff | P0 | H | 4 sprints | Very high |
| Voice/video | Metered session | RTC and moderation complexity | Preflight, consent, quality recovery, recording controls | P0 | H | 4–6 sprints | Very high |
| Wallet | Recharge and deductions | Refund/ledger complexity | Double-entry immutable wallet ledger and reserved holds | P0 | H | 3 sprints | Very high |
| Payments | Recharge/payment gateway | Fragmented reconciliation | Stripe + Razorpay adapters, idempotent webhooks, invoice ledger | Partial | H | 2 sprints | High |
| Practitioner onboarding | Verification/interview/probation | Manual and opaque | Structured KYC, rubric, audit samples, progressive privileges | P0 | H | 3 sprints | High |
| Reviews | Ratings and volume | Rating inflation | Verified-session reviews, dimensions, Bayesian ranking | P1 | M | 2 sprints | High |
| Live sessions | Free/public live streams | Moderation and scale | Scheduled stage, reactions, paid questions, replay highlights | P1 | H | 5 sprints | High |
| Kundli | Free chart | Static and hard to interpret | Interactive chart, evidence graph, AI/expert annotations | P0 | H | 5 sprints | Very high |
| AI readings | Generic generated text | Hallucinations | Deterministic chart facts + retrieval + cited interpretation | P0 | H | 5–7 sprints | Very high |
| Dasha timeline | Text/table | Hard to understand | Zoomable 120-year layered timeline and life-event memory | P1 | H | 3 sprints | High |
| Daily habit | Horoscope/notifications | Generic engagement | Personal transit briefing, streaks, explainable signals | P1 | M | 2 sprints | High |
| Reports/PDF | Paid/static reports | Low interactivity | Modular reports, citations, interactive preview, expert review | P1 | H | 3 sprints | High |
| Matching | 36-point report | Simplistic verdict | Explainable strengths, risks, timing, consent-first language | P1 | H | 3 sprints | High |
| Muhurat | SEO/date pages | Generic location assumptions | Constraint-based finder with location/calendar export | P1 | H | 3 sprints | Medium |
| Referral/rewards | Promotions | Abuse risk | Fraud-scored referrals, staged rewards, transparent ledger | P1 | M | 2 sprints | High |
| Membership | Offers/discounts | Weak recurring value | AI briefings, report credits, priority experts, session savings | P1 | M | 2 sprints | High |
| Notifications | App/push reminders | Fatigue | Preference center, quiet hours, event relevance scoring | P1 | M | 2 sprints | Medium |
| SEO content | Massive long-tail footprint | Quality and duplication | Programmatic pages with editorial guardrails and fact sources | P0 | H | ongoing | Very high |
| Store/remedies | Product commerce | Trust/claims risk | Curated marketplace, evidence/safety copy, fulfillment tracking | P2 | H | 4 sprints | Medium |
| Admin | Operations dashboards | Tool fragmentation | Unified RBAC, audit, finance, CRM, scheduling, AI safety | In progress | H | — | Indirect high |

---

## 6. Major Feature Specifications

### 6.1 Expert marketplace

**Purpose:** Match users to qualified practitioners.  
**Business value:** Primary conversion surface.  
**Flow:** Intent → recommended experts → compare → profile → mode/time → checkout → session.  
**Backend:** ranking service, availability, eligibility, pricing, review aggregates, language/skill search.  
**Tables:** practitioners, practitioner_skills, languages, verification_cases, availability_rules, reviews, favorites, service_rates.  
**APIs:** `GET /api/marketplace`, `GET /api/astrologers/:slug`, `POST /favorites`, `GET /availability`.  
**Security:** public profile allowlist; no personal/KYC data; rate-limited search.  
**Scalability:** denormalized search index; cached profile aggregates; event-driven online status.  
**Improvement:** explainable matching and spend-aware recommendations.

### 6.2 Chat, audio, and video consultation

**Purpose:** Synchronous paid guidance.  
**Business value:** Highest-frequency revenue.  
**Flow:** availability/queue → wallet hold → consent/preflight → session → metered ledger → summary/review.  
**Backend:** WebSocket presence/chat, WebRTC signaling, call provider abstraction, timer authority, wallet reservation, moderation, reconnection, transcript/recording consent.  
**Tables:** consultation_sessions, session_participants, chat_messages, call_events, media_assets, wallet_holds, moderation_flags.  
**APIs/events:** session create/join/end, signed RTC tokens, WebSocket message/presence, heartbeat, duration events.  
**Security:** short-lived room tokens, server-authoritative duration, E2E transport encryption, abuse reporting, PII redaction, recording consent.  
**Scalability:** Redis presence/queues, regional RTC provider, append-only event stream, asynchronous transcript jobs.  
**Improvement:** budget cap, reconnect grace, AI pre-brief and post-session action plan.

### 6.3 Wallet and payments

**Purpose:** Low-friction metered payment.  
**Business value:** Increases repeat purchases and enables instant sessions.  
**Backend:** immutable double-entry ledger, provider adapters, idempotent webhooks, balance holds, settlement/commission.  
**Tables:** wallets, wallet_accounts, wallet_entries, wallet_holds, payment_intents, refunds, coupons, coupon_redemptions, commissions, payouts.  
**Security:** no client-calculated balances, idempotency keys, signed webhooks, transaction isolation, reconciliation jobs, withdrawal risk scoring.  
**Improvement:** transparent expiry/refund rules, wallet optional for fixed bookings, multi-currency presentation.

### 6.4 Practitioner onboarding and KYC

**Purpose:** Establish expert quality and payment eligibility.  
**Flow:** identity → document upload → qualification → interview → sample reading → agreement → probation → publish.  
**Backend:** state machine, document storage, review assignments, scoring rubric, sanctions.  
**Tables:** practitioner_applications, kyc_documents, verification_checks, interview_scores, agreements, quality_audits.  
**Security:** encrypted object storage, malware scanning, signed URLs, least-privilege reviewers, retention policies.  
**Improvement:** visible verification timeline and continuous quality sampling.

### 6.5 Premium AI Vedic Intelligence

**Purpose:** Persistent, explainable personal analysis rather than a generic chatbot.  
**Flow:** birth profile → deterministic chart → structured evidence → intent → retrieval → model interpretation → citations/confidence → memory → expert escalation.  
**Backend layers:**

1. Ephemeris/calculation service.
2. Normalized chart fact graph.
3. Rule/yoga/dasha/transit engine.
4. Versioned interpretation knowledge base.
5. LLM orchestration with tool calls only.
6. Safety and uncertainty validator.
7. Personal memory and life-event timeline.
8. Report/PDF renderer.

**AI outputs:** daily reading, personality, career, marriage, business, finance, health, education, relationships, remedies, muhurat, panchang, transit, dasha, predictive timelines, question answering, voice, multilingual reports.  
**Guardrails:** AI may explain deterministic facts but never invent placements; cite chart factors; distinguish tradition from fact; no medical/legal/financial certainty; crisis routing; user-editable memory.  
**Tables:** birth_charts, chart_versions, celestial_positions, divisional_charts, chart_facts, detected_yogas, dasha_periods, transit_events, ai_threads, ai_messages, ai_memories, ai_runs, ai_citations, reports.  
**Scalability:** cache immutable chart calculations; queue long reports; token budgets; model routing; evaluation datasets; prompt/version registry.

### 6.6 Astrology calculation engine

Required computation contract:

- Sidereal positions for nine grahas with selected ayanamsha.
- Degrees, speed, retrograde, sign, house, nakshatra, pada, dignity.
- Ascendant and house cusps.
- North and South Indian render models.
- D1 plus 16 divisional charts.
- Shadbala, Ashtakavarga, yogas, doshas, house and planet analysis.
- Vimshottari 120-year Mahadasha/Antardasha/Pratyantar hierarchy.
- Transit, Sade Sati, retrogrades, lunar phases, eclipses, and planetary events.
- Versioned calculation settings and reproducible outputs.

Use a dedicated tested ephemeris service/library; do not implement astronomical positions with ad-hoc date formulas. Store calculation version, ayanamsha, timezone, coordinates, and source precision with every chart.

### 6.7 Reviews and quality ranking

Only completed, paid consultations may create reviews. Dimensions: clarity, empathy, usefulness, punctuality, communication. Publish text after moderation. Ranking uses Bayesian averages, completion rate, repeat rate, response reliability, recent quality, price fit, and intent fit—never raw star average alone.

### 6.8 Referrals, coupons, streaks, membership

- Referral rewards unlock after anti-fraud qualification and first paid order.
- Coupon rules are server-evaluated and redemption is atomic.
- Streaks reward meaningful daily behavior, not notification spam.
- Membership bundles AI reports, monthly credits, priority booking, and transparent session discounts.

---

## 7. Database Architecture

### Current production core

PostgreSQL + Drizzle already covers services, practitioners, schedules, time off, members, administrators, sessions, bookings, invoices, payments, messages, settings, invitations, Stripe events, and audit logs.

### Planned domain tables

- **Marketplace:** practitioner_skills, practitioner_languages, practitioner_rates, favorites, reviews, review_dimensions.
- **Verification:** practitioner_applications, kyc_documents, verification_checks, quality_audits.
- **Consultation:** consultation_sessions, participants, messages, call_events, recordings, transcripts.
- **Wallet:** wallets, wallet_entries, holds, recharge_orders, coupons, redemptions.
- **Payout:** commission_rules, practitioner_earnings, payout_accounts, withdrawals.
- **Astrology:** birth_charts, chart_versions, planetary_positions, houses, vargas, yogas, ashtakavarga, dasha_periods, transit_events.
- **AI:** ai_threads, ai_messages, ai_runs, ai_memories, ai_citations, reports, report_sections.
- **Content:** articles, categories, authors, content_versions, seo_pages, faq_items.
- **Notifications:** notification_events, deliveries, templates, preferences, devices.
- **Commerce:** products, variants, inventory, orders, order_items, shipments, remedy_instructions.
- **Growth:** referrals, reward_entries, streak_events, memberships, subscriptions.
- **Analytics:** product_events, experiment_assignments, attribution_touches, daily_aggregates.

Financial, wallet, booking, payout, and audit tables must use PostgreSQL transactions and immutable ledgers. Use integer minor units for money and store currency explicitly.

---

## 8. API Architecture

### API styles

- REST route handlers for CRUD and checkout.
- WebSocket gateway for chat/presence/session timers.
- WebRTC provider tokens for calls/video/live.
- Event queue for reports, notifications, reconciliation, content generation, and moderation.
- Versioned internal astrology and AI tool APIs.

### Required resource groups

- `/api/auth/*`, `/api/members/*`, `/api/admin/*`
- `/api/marketplace`, `/api/practitioners/*`, `/api/availability`
- `/api/bookings/*`, `/api/sessions/*`
- `/api/chat/*`, `/api/calls/*`, `/api/live/*`
- `/api/wallet/*`, `/api/payments/*`, `/api/webhooks/*`
- `/api/reviews/*`, `/api/referrals/*`, `/api/coupons/*`
- `/api/charts/*`, `/api/dasha/*`, `/api/transits/*`
- `/api/ai/*`, `/api/reports/*`
- `/api/content/*`, `/api/search/*`, `/api/notifications/*`

Every mutation uses authentication, authorization, validation, idempotency where financial, audit logging, rate limiting, and structured errors.

---

## 9. Recommended Technology Architecture

### Recommended production architecture

- **Web:** Next.js App Router, React, TypeScript, Tailwind CSS, semantic CSS tokens, Framer Motion selectively, shadcn/Radix primitives.
- **Core backend:** Next.js/BFF plus extracted Node services as traffic requires.
- **System of record:** PostgreSQL + Drizzle. Better than Firestore for financial ledgers, booking conflicts, relational marketplace data, reports, and auditability.
- **Cache/queues/presence:** Redis and managed queue/event bus.
- **Object storage:** Google Cloud Storage or S3 with signed uploads, malware scanning, and lifecycle policies.
- **Auth:** Current secure session model or Firebase Auth/Auth.js for Google/OTP federation. Map external identities to PostgreSQL users.
- **Push/analytics:** Firebase Cloud Messaging and Firebase/GA4 analytics are appropriate.
- **AI:** OpenAI and Gemini behind a provider abstraction, with deterministic tools and evaluation gates.
- **Payments:** Stripe globally; Razorpay for India/UPI; provider-neutral payment intent model.
- **RTC:** Daily, Twilio, Agora, or LiveKit Cloud; do not build media transport from scratch.
- **Search:** PostgreSQL FTS initially; Algolia/OpenSearch at marketplace/content scale.
- **Charts:** D3 for zodiac/timeline; Recharts for operations analytics.
- **Hosting:** Vercel for web/BFF; Cloud Run for ephemeris, realtime gateway, and background workers.
- **Monitoring:** Sentry, OpenTelemetry, structured logs, uptime checks, webhook/queue DLQ dashboards.

### Firebase/Firestore alternative requested

If Firebase is mandatory:

- Firebase Auth: users and federated identity.
- Firestore: non-financial realtime chat projections, presence summaries, notification feeds.
- Cloud Functions/Cloud Run: webhooks, reports, AI orchestration.
- Cloud Storage: KYC/media/PDF.
- FCM: push.
- Analytics: client events.

Do **not** make Firestore the sole source of truth for wallet balances, payments, payouts, booking conflict locks, or commission ledgers. Keep those in PostgreSQL and project read models to Firestore.

Suggested Firestore collections:

- `presence/{practitionerId}`
- `sessionThreads/{sessionId}/messages/{messageId}`
- `notificationFeeds/{userId}/items/{notificationId}`
- `liveRooms/{roomId}`
- `publicPractitionerCards/{practitionerId}`

Security rules must enforce signed-in ownership, participant membership, role claims, immutable sender/user IDs, server-only wallet/payment writes, size limits, and denied-by-default collection access.

---

## 10. Security Architecture

- Role and permission checks at page and API layers.
- HTTP-only, SameSite cookies and server-side revocable sessions.
- OAuth/OTP account-linking protections.
- Rate limiting by identity, IP, route, and risk score.
- CSRF protection for cookie-authenticated cross-site mutations where SameSite is insufficient.
- Zod or equivalent strict validation for all external input.
- Database uniqueness/exclusion constraints for conflict-critical records.
- Idempotency keys for payments, wallet operations, booking creation, and webhooks.
- Double-entry wallet and payout ledgers.
- Signed webhook verification against raw bodies.
- KYC document encryption, signed URLs, retention and deletion jobs.
- PII field classification, log redaction, and data export/deletion workflows.
- Abuse detection, block/report tools, moderation queues, and emergency escalation.
- Secrets only in managed environment configuration; key rotation runbooks.
- Dependency scanning, SAST, CSP, HSTS, secure headers, and image/upload validation.
- Immutable audit trail for administrative, financial, AI-safety, and moderation actions.

---

## 11. SEO Strategy

### Technical

- Dynamic metadata and canonical URLs.
- `Organization`, `WebSite`, `Person`, `Service`, `Product`, `Article`, `FAQPage`, `BreadcrumbList`, `Review`, and `AggregateRating` JSON-LD only when evidence exists.
- Segmented sitemaps: static pages, practitioners, topics, horoscopes, muhurats, articles, products.
- Robots rules blocking account/admin/search-parameter duplication.
- Open Graph and Twitter cards with generated practitioner/report imagery.
- Image dimensions, descriptive alt text, AVIF/WebP, lazy loading.
- ISR/caching for public profiles/content; dynamic/no-store for private data.
- Core Web Vitals budgets and route-level bundle budgets.

### Content architecture

- Pillar hubs: Kundli, Dasha, Transits, Relationships, Career, Muhurat, Panchang.
- Supporting expert-reviewed articles and glossary pages.
- Programmatic horoscope/muhurat pages generated from verified deterministic data, not unreviewed filler.
- Practitioner specialty and language pages only when enough unique inventory exists.
- City pages with real availability and unique editorial content; avoid doorway pages.
- Strong internal linking from tools/results to explanations and relevant experts.
- Author credentials, reviewed dates, methodology, and calculation settings.

---

## 12. Design System and Component Library

### Tokens

- Warm ivory, parchment, copper, umber, antique gold, slate accent.
- Editorial serif for meaning; compact neutral sans for controls/data.
- 4/8px spacing rhythm, 12–16px card radii, subtle translucent surfaces.
- Light and dark semantic tokens; WCAG AA contrast.

### Components

- Brand mark, public header, marketplace filter rail, practitioner card/profile hero.
- Trust badge, verification timeline, rating distribution, availability slot picker.
- Kundli canvas, divisional chart tabs, evidence chip, score gauge, timeline zoom.
- AI evidence panel, confidence label, cited insight card, memory control.
- Session preflight, chat bubble, call controls, wallet burn meter, budget alert.
- Invoice, transaction row, reward ledger, notification center.
- Skeletons, empty/error/offline states, dialogs, toasts, tables, mobile bottom sheets.

### Motion

Use motion to explain state—not decorate every surface. Respect reduced motion. Keep input responses under 100ms, route feedback immediate, and long AI/report operations visible through staged progress.

---

## 13. Admin Dashboard Specification

Existing base is strong. Future modules:

- **Verification:** application queue, document review, rubric, interview, probation.
- **Marketplace:** ranking weights, rates, skills, languages, online state, quality status.
- **Sessions:** live active sessions, queue health, abuse flags, disconnects, refunds.
- **Wallet/commission:** deposits, holds, deductions, provider reconciliation, commissions.
- **Payouts:** KYC status, payable earnings, withdrawal review, tax statements.
- **Reviews:** moderation, fraud signals, practitioner response.
- **Live:** room schedule, host controls, moderation and replay.
- **Content/SEO:** editorial calendar, schema preview, index status, content quality.
- **AI safety:** run review, hallucination flags, prompt versions, eval scores, model spend.
- **Growth:** coupons, referrals, membership, campaigns, experiments.

---

## 14. Mobile App Specification

- React Native or Flutter sharing backend contracts.
- OTP/Google/Apple login and biometric re-entry.
- Bottom tabs: Today, Experts, AI, Journey, Account.
- Native call UI, CallKit/ConnectionService integration, background push handling.
- FCM/APNs, deep links, notification preferences, quiet hours.
- Low-bandwidth chat and reconnectable calls.
- Downloadable reports and consultation summaries.
- Wallet/recharge with native payment compliance.
- Accessibility: dynamic type, screen readers, haptics settings, RTL/multilingual support.

---

## 15. Folder Structure

```text
src/
  app/
    (public)/
    dashboard/
    practitioner/
    admin/
    api/
  components/
    ui/
    marketplace/
    astrology/
    ai/
    sessions/
    wallet/
    admin/
  db/
    schema/
    queries/
  domain/
    booking/
    billing/
    wallet/
    astrology/
    marketplace/
  lib/
    auth/
    ai/
    ephemeris/
    realtime/
    payments/
    notifications/
  workers/
    reports/
    notifications/
    reconciliation/
    moderation/
docs/
  architecture/
  api/
  runbooks/
  product/
```

Keep domain logic out of React components and route handlers. Routes authenticate/validate, domain services execute transactions, and repositories access Drizzle.

---

## 16. Delivery Roadmap

### Phase A — Marketplace conversion (2–3 sprints)

- Public expert listing/profile.
- Skills/languages/rates/reviews/favorites.
- Expert matching and practitioner deep-link booking.
- Verification badge design and SEO metadata.

### Phase B — Wallet and instant chat (3–4 sprints)

- Double-entry wallet, recharge, coupons, holds.
- Presence, queueing, metered chat, budget controls.
- Practitioner operations and earnings events.

### Phase C — Calls/video and payouts (4–5 sprints)

- RTC provider integration and session authority.
- Reconnect, moderation, consent, summaries.
- Commission ledger and withdrawals.

### Phase D — Astrology calculation foundation (4–6 sprints)

- Ephemeris service, chart/version storage, D1 and vargas.
- Dasha/transit/rule engine and interactive visualizations.
- Reproducibility and calculation evaluation suite.

### Phase E — AI Vedic Intelligence (4–6 sprints)

- Tool-only chart retrieval, evidence graph, memories.
- Domain analyses, Q&A, remedies, reports/PDF.
- Voice/multilingual, safety evals and expert escalation.

### Phase F — Growth/content/live (ongoing)

- Horoscope habit loops, referrals, membership.
- Content platform/programmatic SEO.
- Live sessions, paid questions, replay.
- Store/remedies when trust and operations are ready.

Each sprint includes accessibility, observability, tests, security review, analytics events, documentation, and migration rollback planning.

---

## 17. Testing Strategy

- Unit tests for money, timezones, Dasha/rule calculations, ranking, commissions, and permissions.
- Property-based tests for wallet invariants and chart reproducibility.
- Integration tests against ephemeral PostgreSQL and provider test environments.
- Contract tests for Stripe/Razorpay/RTC/AI providers.
- E2E tests for signup, profile, wallet, booking, chat/call, reviews, refunds, payouts.
- Concurrency tests for slot booking, wallet holds, webhook replay, payout settlement.
- Security tests for IDOR, role escalation, CSRF, XSS, upload abuse, webhook forgery.
- AI evaluations for unsupported claims, chart fact accuracy, citations, harmful advice, multilingual consistency.
- Load tests for marketplace search, chat fan-out, presence, live sessions, and notification bursts.
- Visual regression at mobile/tablet/desktop and both themes.
- Lighthouse/Core Web Vitals budgets in CI.

---

## 18. Deployment and DevOps Plan

- Preview environment per pull request.
- Staging with provider sandboxes and anonymized fixtures.
- Transactional migrations with backups and rollback runbooks.
- Blue/green or canary for realtime, ephemeris, and AI services.
- Queue dead-letter handling and replay tools.
- Stripe/Razorpay reconciliation and webhook lag alerts.
- Sentry releases, source maps, traces, structured logs, uptime and synthetic checkout/session tests.
- Database PITR, encrypted backups, restore drills, connection pooling.
- Feature flags for wallet, calls, live, AI model versions, and pricing experiments.
- Incident response, status page, RTO/RPO definitions, and on-call ownership.

---

## 19. Production Checklist

### Product

- All empty/error/loading/offline/cancelled/refunded states designed.
- Pricing, fees, commissions, cancellation and refund terms visible.
- Analytics event dictionary and conversion funnels approved.
- Accessibility and localization review complete.

### Security/privacy

- Threat model and data inventory complete.
- Secrets rotated and provider webhooks verified.
- Rate limits, CSP, HSTS, secure cookies and audit logs enabled.
- PII export/deletion and consent flows tested.
- KYC and recording retention policies approved.

### Finance

- Double-entry invariants tested.
- Idempotent payment/refund/recharge/webhook handling.
- Reconciliation dashboard and alerts live.
- Commission, payout, tax, and currency rules approved.

### Reliability

- Load and concurrency tests passed.
- Backup restore drill passed.
- Queue DLQs and replay tools tested.
- RTC failure/reconnect and degraded-mode behavior tested.

### SEO/performance

- Canonicals, sitemap, robots, JSON-LD and OG validated.
- No private pages indexed.
- LCP/INP/CLS budgets passed on representative devices.
- Images and fonts optimized; JavaScript budgets enforced.

### AI

- Deterministic facts separated from interpretation.
- Prompt/model/calculation versions recorded.
- Safety and factual evaluation thresholds met.
- User memory controls and AI disclosure present.
- High-risk advice disclaimers and escalation active.

---

## 20. Current Implementation Status

The current application already provides a production foundation beyond a typical prototype:

- Premium public marketing experience.
- PostgreSQL/Drizzle service catalogue.
- Member and administrator authentication with revocable sessions.
- Natal onboarding and personalized member dashboard.
- Scheduled consultations, member cancellation, and history.
- Practitioner profiles, weekly availability, time off, timezone-aware slots, and conflict prevention.
- Admin CRM, bookings, schedule, billing, messaging, analytics, audit, settings, and RBAC.
- Invoices, receipts, manual collection/refunds, optional Stripe Checkout, and verified webhook architecture.
- Secure team invitations and role-scoped workspaces.
- In-app member/studio messaging and booking notifications.
- Responsive parchment/copper design system.

The next recommended implementation milestone is **Phase A: public expert marketplace, verification, reviews, favorites, and practitioner deep-link booking**, followed by wallet and instant chat.
