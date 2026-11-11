# Marketing skills (vendored)

Source: [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
v2.13.0 by Corey Haines (MIT, see `MARKETING-SKILLS-LICENSE`), installed as project skills
instead of as a plugin. 24 of the 54 skills are here.

## Start here

Every skill first reads `.agents/product-marketing.md`, this site's marketing context. Its
house rules (no fake urgency or proof, astrology honesty, AI disclosure, two-number rule,
consent, no paid tools without asking) override anything a skill suggests. Keep it current with the
`product-marketing` skill.

## What is here

| Use it for | Skills |
|---|---|
| Pages and copy | `copywriting`, `copy-editing`, `cro`, `popups`, `ab-testing` |
| The offer | `offers`, `marketing-psychology` |
| Messages | `emails`, `sms` (covers WhatsApp), `churn-prevention` (renewals, failed payments) |
| Social and ads | `social`, `ads`, `ad-creative`, `influencer-marketing`, `events` |
| Growth | `referrals`, `lead-magnets`, `free-tools` (kundli, panchang, numerology) |
| Measurement | `analytics`, `conversion-tracking` (Meta Pixel/CAPI, GTM recipes) |
| Research and planning | `product-marketing`, `customer-research`, `competitor-profiling`, `marketing-plan` |

All skills are Markdown. `conversion-tracking/scripts/*.py` are offline, standard-library
helpers that build a GTM import file; they make no network calls.

## Paid services some skills mention

Nothing here calls an API on its own, but some skills suggest paid tools. Ask the owner first.

- `ad-creative`: image/video generators (Gemini, OpenAI, Ideogram, Runway, ElevenLabs, Higgsfield).
- `sms`: Twilio, Klaviyo. This site has no SMS or WhatsApp sending yet; email goes through Resend.
- `churn-prevention`: Stripe-style dunning. This site uses Razorpay.
- `ads`: spends real money on Meta/Google. Never launch or change a campaign without the owner.

## Left out, and why

- **Covered by installed packs:** `seo-audit`, `ai-seo`, `schema`, `site-architecture`
  (GEO SEO, searchfit-seo, agent-skills); `content-strategy` (searchfit-seo and small-business
  plugins, plus `content/plan/next-90.csv`); `video`, `image` (Remotion, UI/UX design skills,
  and they lean on paid HeyGen/Runway/image APIs).
- **SaaS or B2B only:** `aso`, `paywalls`, `signup`, `onboarding`, `pricing`, `revops`,
  `sales-enablement`, `prospecting`, `cold-email`, `co-marketing`, `directory-submissions`,
  `launch`, `attribution`, `competitors` ("vs" pages), `community-marketing`, `marketing-ideas`,
  `public-relations`, `link-building`.
- **Wrong direction for this site:** `programmatic-seo` (mass template pages; the 30 AI
  astrologer profiles are already thin, see Phase 8 in `CLAUDE.md`). `marketing-loops` and
  `marketing-council` need the upstream tool CLIs or are role-play.
- **Not vendored at all:** `tools/` (67 API wrapper CLIs and partner integration docs, most
  paid), `.github/` workflows and `sync-skills.js`, plugin manifests, `scripts/`, `tests/`,
  validators, `partners.json`, and every skill's `evals/` folder. Some skills still link to
  `tools/REGISTRY.md` or `tools/integrations/*.md`; those links are dead here on purpose.

## Changes from upstream

None to the skill files. Update by re-copying a skill folder from a new release and reviewing
the diff.
