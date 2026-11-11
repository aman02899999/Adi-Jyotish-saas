# Product marketing context: Astronomers.in (Adi Jyotish Guru)

Document version: 1.0 (2026-11-11)

Every marketing skill in `.claude/skills/` reads this file first. It is a summary. When it
disagrees with the code, the code wins: prices in `src/lib/services.ts`, `src/lib/plans.ts` and
the admin's plans, copy in `messages/en.json`, `messages/hi.json` and the admin's site content,
rules in `CLAUDE.md`.

## House rules (these override any skill's advice)

1. **No fake proof or urgency.** No invented reviews, ratings, consultation counts, "online
   now" for people who aren't, "most chosen" badges without plan data, struck-out prices that
   were never charged, countdowns that reset or made-up testimonials. Synthetic reviews
   (`source: "seed"`) never reach a public page. Every number has a source.
2. **Astrology is belief and guidance, never science or certainty.** No "100% accurate", no
   guaranteed marriage, job, visa or result, no "solved in 7 days".
3. **No fear selling.** Never "your dosha will ruin your life unless you buy". Remedies are
   optional, with the low-cost option first, and never the only way out.
4. **Never predict** death, serious illness, accidents, pregnancy outcome or a baby's sex.
   Health questions get "please see a doctor"; legal and money questions get "please consult a
   professional". Gemstones and rudraksha never cure anything.
5. **AI is labelled as AI** on every surface: card, profile, chat, reading page, checkout, PDF,
   email, ad and social post. An AI persona never gets years of experience, a lineage, a city
   or a "verified" badge. Say a reading is AI-made; do not name the vendor model.
6. **Consent.** Marketing email, WhatsApp and push go only to contacts with recorded consent
   (source and date) and a one-tap opt-out, inside the daily caps. Never test on real
   customers. If WhatsApp is used, the bot number sends and every automated message points to
   the human number.
7. **Personal data.** Birth date, time and place are personal data under the DPDP Act. They
   never go into ad audiences, analytics events, email subject lines or screenshots.
8. **No paid tools by default.** Skills mention paid APIs (image and video generators, ad
   platforms, ESPs). Ask the owner before signing up for or calling any of them.
9. **Original media only.** No deity images or temple photos without rights, no celebrity
   faces or names, AI-made images labelled.
10. **Voice.** Warm, simple, calm. Hinglish on the Hindi pages. Run all customer-facing copy
    through the `humanizer` skill.

## Product

A Vedic astrology platform at https://www.astronomers.in, in English and Hindi (`/hi/...`).

- **Free tools (computed, no AI):** birth chart, Kundli, Kundli Matching (Ashtakoot), Panchang,
  Muhurat, Numerology, Horoscope, Varshphal, Cosmic Profile Card, compatibility, astro journal.
  These are the main hook.
- **Human consultations:** two real astrologers, Shree Jagmohan Shashtri Ji and Shree Arun
  Dubey Ji, by per-minute chat and booked sessions. They are the premium tier.
- **AI chat astrologers:** 30 personas, each labelled "AI astrologer · Not a person".
- **AI readings at a fixed price:** Ask Live, Palm, Tarot, Face, Vastu, Lal Kitab.
- **Membership:** Free, Plus and Pro, monthly or yearly.
- **Also:** wallet and recharge, gift cards, family plan, referrals, GST invoices, blog,
  festival pages. The gemstone store is "coming soon"; do not market it until certified stock
  and return terms exist.

Read live prices from the code or the admin before quoting any of them.

## Brand (open decision)

Three names are in use: "Astronomers" (domain), "Adi Jyotish Guru" (site) and "jyotish.studio"
(some email addresses). The owner has not picked one. Until then use the name the page already
shows, and do not create new brand assets.

## Audience (inferred, not yet researched)

- People in India searching for a free kundli, kundli matching for marriage, today's rashifal,
  panchang or a muhurat date. Mostly on phones, Hindi or Hinglish first, price-aware.
- People with one pressing question (marriage, career, family) who want a person to talk to.
- Families planning a wedding, griha pravesh or naming ceremony around a muhurat.

Use `customer-research` before treating any of this as fact.

## Offers

No time-limited offer is running. The standing offers are the free tools, the first Live
reading free for members, and the plan discounts on consultations. Do not invent a deadline.

## Channels

Website, email through Resend, Meta Pixel when its ID is set. Which socials to use
(Instagram, Facebook, YouTube, WhatsApp channel) and which phone numbers is an open owner
decision; no channel is automated yet.

## The disclaimer that stays on every page

"Readings are offered for guidance and self-reflection. They are not a substitute for medical,
legal, or financial advice, and no specific outcome is guaranteed."

## Known gaps (Nov 2026)

- No revenue, member or traffic numbers yet. Get them from Razorpay, Firebase and Search
  Console before any claim about what works.
- The recurring email automations were removed before launch; only the uptime check runs.
- No consent ledger for marketing messages has been verified.

## Changelog

- 1.0 (2026-11-11): first draft from `CLAUDE.md`, `README.md`, `src/lib/services.ts` and
  `messages/en.json`. Owner to review the audience and brand sections.
