import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import nextDynamic from "next/dynamic";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Compass,
  Gem,
  GraduationCap,
  Hand,
  Hash,
  Heart,
  HeartHandshake,
  HeartPulse,
  Home,
  Layers,
  MessageCircle,
  Orbit,
  PartyPopper,
  Quote,
  ScanFace,
  ScrollText,
  Sparkles,
  Star,
  Sun,
  Users,
} from "lucide-react";
import { AvatarImage } from "@/components/avatar-image";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { JsonLd } from "@/components/json-ld";
import { getSiteUrl } from "@/lib/site-url";
import { getFeaturedTestimonials, getHomepageStats, getLivePractitioners, getOnlineNowCount, getSeniorAstrologers } from "@/lib/homepage";
import { getPublishedServices } from "@/lib/services";
import { REFERRAL_REFERRER_REWARD, REFERRAL_REFEREE_REWARD } from "@/lib/referrals";
import { getDailyHoroscope, ZODIAC_SIGNS } from "@/lib/horoscopes";
import { getHomeHeroContent } from "@/lib/site-content";
import { HomeHoroscopeTeaser } from "@/components/home-horoscope-teaser";
import { HeroVideo } from "@/components/hero-video";
import { StartHerePicker } from "@/components/start-here-picker";

// framer-motion (the animation library behind both of these) is ~150KB and otherwise only used
// on this page — dynamic() splits it into its own chunk loaded alongside, instead of inline in the
// shared bundle every route pays for. Both still render their real server HTML immediately (no
// ssr:false), so there's no layout shift; only the hydration JS is deferred.
const TiltCard = nextDynamic(() => import("@/components/tilt-card").then((mod) => mod.TiltCard));
const StatCounter = nextDynamic(() => import("@/components/stat-counter").then((mod) => mod.StatCounter));

export const dynamic = "force-dynamic";

const iconMap = {
  orbit: Orbit,
  sun: Sun,
  calendar: CalendarDays,
  heart: Heart,
  briefcase: BriefcaseBusiness,
  sparkles: Sparkles,
};

const categories = [
  { icon: Heart, key: "relationship" as const, query: "relationship" },
  { icon: Users, key: "marriage" as const, query: "marriage" },
  { icon: BriefcaseBusiness, key: "career" as const, query: "career" },
  { icon: HeartPulse, key: "health" as const, query: "health" },
  { icon: Home, key: "vastu" as const, query: "vastu" },
  { icon: GraduationCap, key: "education" as const, query: "education" },
];

// Grouped by intent (what the visitor is trying to do) instead of one flat 15-tile grid — makes
// the free-tools strip scannable instead of a wall of icons.
const freeToolGroups = [
  {
    groupKey: "knowYourDay" as const,
    tools: [
      { icon: Sun, key: "horoscope" as const, href: "/horoscope" },
      { icon: CalendarDays, key: "panchang" as const, href: "/panchang" },
      { icon: CalendarClock, key: "muhurat" as const, href: "/muhurat" },
      { icon: PartyPopper, key: "festivals" as const, href: "/festivals" },
    ],
  },
  {
    groupKey: "understandYourChart" as const,
    tools: [
      { icon: ScrollText, key: "kundli" as const, href: "/kundli" },
      { icon: Sparkles, key: "varshphal" as const, href: "/varshphal" },
      { icon: Hash, key: "numerology" as const, href: "/numerology" },
      { icon: HeartHandshake, key: "kundliMatching" as const, href: "/kundli-matching" },
      { icon: Gem, key: "gemstoneMatch" as const, href: "/gemstones/recommend" },
    ],
  },
  {
    groupKey: "talkToSomeone" as const,
    tools: [
      { icon: MessageCircle, key: "ask" as const, href: "/ask" },
      { icon: Hand, key: "palm" as const, href: "/palm-reading" },
      { icon: Layers, key: "tarot" as const, href: "/tarot-reading" },
      { icon: ScanFace, key: "face" as const, href: "/face-reading" },
      { icon: Compass, key: "vastu" as const, href: "/vastu-consultation" },
      { icon: BookOpen, key: "lalKitab" as const, href: "/lal-kitab-reading" },
    ],
  },
];

export default async function HomePage() {
  const t = await getTranslations("Home");
  const defaultSign = ZODIAC_SIGNS[0];
  const [services, stats, liveExperts, testimonials, seniorAstrologers, onlineCount, defaultHoroscope, hero] = await Promise.all([getPublishedServices(), getHomepageStats(), getLivePractitioners(), getFeaturedTestimonials(), getSeniorAstrologers(), getOnlineNowCount(), getDailyHoroscope(defaultSign.key).catch(() => null), getHomeHeroContent()]);
  const seniorMain = seniorAstrologers.slice(0, 2);
  const seniorRest = seniorAstrologers.slice(2);

  return (
    <main className="marketing-page">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Jyotish",
        url: getSiteUrl().toString(),
        logo: new URL("/images/vedic-hero.jpg", getSiteUrl()).toString(),
        description: "Authentic Vedic astrology readings, cosmic insights, and auspicious timing.",
        aggregateRating: stats.averageRating ? { "@type": "AggregateRating", ratingValue: stats.averageRating, reviewCount: Math.max(1, stats.consultationsDelivered) } : undefined,
      }} />
      <StartHerePicker />
      <SiteHeader />

      <section className="hero-cosmic">
        <div className="hero shell">
          <div className="hero-copy reveal">
            <p className="eyebrow"><span /> {hero.eyebrow}</p>
            <h1>{hero.headline}<br /><em>{hero.headlineEm}</em></h1>
            <p className="hero-lead">
              {hero.lead}
            </p>
            <div className="hero-actions">
              <Link href={hero.primaryCtaHref} className="button">{hero.primaryCtaLabel} <ArrowRight size={17} /></Link>
              <Link href={hero.secondaryCtaHref} className="button button--ghost">{hero.secondaryCtaLabel}</Link>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack" aria-hidden="true">
                {liveExperts.slice(0, 3).map((expert) => <span key={expert.id}>{expert.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>)}
              </div>
              <div><strong>{stats.averageRating || "—"}</strong> <span className="stars">★★★★★</span><small>{stats.consultationsDelivered >= 100 ? t("hero.trustedByCount", { count: stats.consultationsDelivered }) : t("hero.trustedByGrowing")}</small></div>
            </div>
          </div>

          <div className="reveal reveal--delay">
            <HeroVideo
              posterSrc="/images/homepage-hero-poster.jpg"
              mp4Src="/videos/homepage-hero.mp4"
              webmSrc="/videos/homepage-hero.webm"
              label="brand video"
            />
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label={t("aria.trustStrip")}>
        <div className="shell trust-grid">
          <div><strong>{stats.consultationsDelivered >= 100 ? <><StatCounter value={stats.consultationsDelivered} />+</> : <StatCounter value={stats.consultationsDelivered} />}</strong><span>{t("trustStrip.consultations")}</span></div>
          <div><strong><StatCounter value={stats.practitionerCount} /></strong><span>{t("trustStrip.astrologers")}</span></div>
          <div><strong>{stats.averageRating ? <><StatCounter value={stats.averageRating} decimals={1} />/5</> : "—/5"}</strong><span>{t("trustStrip.avgRating")}</span></div>
          <div><strong><StatCounter value={100} suffix="%" /></strong><span>{t("trustStrip.privatePersonal")}</span></div>
        </div>
      </section>

      <section className="category-strip shell" aria-label={t("aria.categories")}>
        <div className="section-heading reveal">
          <div><p className="eyebrow"><span /> {t("categories.eyebrow")}</p><h2 style={{ fontSize: "clamp(32px,3.4vw,46px)" }}>{t("categories.headline")}<br /><em>{t("categories.headlineEm")}</em></h2></div>
        </div>
        <div className="category-grid">
          {categories.map(({ icon: Icon, key, query }) => (
            <div className="reveal" key={key}>
              <TiltCard>
                <Link href={`/astrologers?q=${encodeURIComponent(query)}`} className="category-tile">
                  <span><Icon size={21} strokeWidth={1.4} /></span>
                  <strong>{t(`categories.${key}.label`)}</strong>
                  <small>{t(`categories.${key}.note`)}</small>
                </Link>
              </TiltCard>
            </div>
          ))}
        </div>
      </section>

      {seniorMain.length > 0 && (
        <section className="senior-strip shell" aria-label={t("aria.seniors")}>
          <div className="section-heading reveal">
            <div><p className="eyebrow"><span /> {t("seniors.eyebrow")}</p><h2 style={{ fontSize: "clamp(32px,3.4vw,46px)" }}>{t("seniors.headline")}<br /><em>{t("seniors.headlineEm")}</em></h2></div>
          </div>
          <div className="senior-main-grid">
            {seniorMain.map((expert) => (
              <div className="reveal" key={expert.id}>
                <TiltCard strength={4}>
                  <article className="senior-main-card">
                    <div className="senior-main-card__photo">
                      <AvatarImage src={expert.photoUrl} alt={expert.name} fallback={<span>{expert.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>} />
                      {expert.verified && <em><CheckCircle2 size={13} /> {t("seniors.verified")}</em>}
                    </div>
                    <div className="senior-main-card__body">
                      <p className="senior-main-card__title">{expert.title}</p>
                      <h3>{expert.name}</h3>
                      <div className="senior-main-card__meta">
                        <span>{t("seniors.yearsExperience", { years: expert.experienceYears })}</span>
                        <span>{expert.sessionPrice != null ? `₹${expert.sessionOriginalPrice} → ₹${expert.sessionPrice} (${expert.sessionDiscountPercent}% off)` : `₹${expert.chatRatePerMinute}/min`}</span>
                      </div>
                      <p className="senior-main-card__bio">{expert.bio}</p>
                      <div className="senior-main-card__tags">
                        {expert.specialties.split(",").slice(0, 7).map((tag) => <span key={tag}>{tag.trim()}</span>)}
                      </div>
                      <div className="senior-main-card__actions">
                        <Link href={`/astrologers/${expert.slug}`} className="button">{t("seniors.viewProfile")} <ArrowRight size={15} /></Link>
                        <Link href={`/book?practitioner=${expert.id}`} className="button button--ghost">{t("seniors.bookConsultation")}</Link>
                      </div>
                    </div>
                  </article>
                </TiltCard>
              </div>
            ))}
          </div>
          {seniorRest.length > 0 && (
            <div className="senior-grid">
              {seniorRest.map((expert) => (
                <Link href={`/astrologers/${expert.slug}`} className="senior-card reveal" key={expert.id}>
                  <div className="senior-card__avatar">
                    <AvatarImage src={expert.photoUrl} alt={expert.name} fallback={<span>{expert.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>} />
                  </div>
                  <strong>{expert.name}</strong>
                  <span>{expert.title}</span>
                  <small>{t("seniors.yrsShort", { years: expert.experienceYears })} · {expert.sessionPrice != null ? `${expert.sessionDiscountPercent}% off, ₹${expert.sessionPrice}` : `₹${expert.chatRatePerMinute}/min`}</small>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {liveExperts.length > 0 && (
        <section className="live-strip shell" aria-label={t("aria.live")}>
          <div className="live-strip__head reveal">
            <div>
              <p className="live-pulse"><i /> {t("live.onlineNow", { count: onlineCount })}</p>
              <h2 style={{ margin: 0, font: "400 clamp(34px,3.8vw,50px)/1.02 var(--serif)", letterSpacing: "-.04em" }}>{t("live.headline")}<br /><em style={{ color: "var(--copper)" }}>{t("live.headlineEm")}</em></h2>
            </div>
            <p style={{ maxWidth: 360, color: "var(--muted)", fontSize: 13, lineHeight: 1.75 }}>{t("live.subhead")}</p>
          </div>
          <div className="live-grid">
            {liveExperts.map((expert) => (
              <article className="live-card reveal" key={expert.id}>
                <div className="live-card__top">
                  <div className="live-card__avatar">
                    <span>{expert.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
                    <i className={`live-card__dot ${expert.online ? "" : "live-card__dot--off"}`} />
                  </div>
                  <div className="live-card__name">
                    <strong>{expert.name}</strong>
                    <span>{expert.online ? t("live.isOnline") : t("live.isOffline")}</span>
                  </div>
                </div>
                <div className="live-card__rating"><Star size={13} fill="currentColor" /><strong>{expert.rating?.toFixed(1) ?? "New"}</strong><small>{t("live.reviews", { count: expert.reviewCount })} · {t("seniors.yrsShort", { years: expert.experienceYears })}</small></div>
                <div className="live-card__tags">{expert.specialties.split(",").slice(0, 3).map((tag, tagIndex) => <span key={tag} className={tagIndex === 0 ? "primary-specialty" : undefined}>{tag.trim()}</span>)}</div>
                <div className="live-card__foot">
                  <div className="live-card__price">{expert.sessionPrice != null ? (
                    <strong><s style={{ opacity: .5, fontSize: 12 }}>₹{expert.sessionOriginalPrice}</s> ₹{expert.sessionPrice}<small style={{ display: "inline", fontSize: 9 }}>·{expert.sessionDiscountPercent}% off</small></strong>
                  ) : expert.reviewDiscountPercent > 0 ? (
                    <strong><s style={{ opacity: .5, fontSize: 12 }}>₹{expert.chatRatePerMinute}</s> ₹{expert.discountedRatePerMinute}<small style={{ display: "inline", fontSize: 9 }}>/min</small></strong>
                  ) : (
                    <strong>₹{expert.chatRatePerMinute}<small style={{ display: "inline", fontSize: 9 }}>/min</small></strong>
                  )}<small>{t("live.chatNow")}</small></div>
                  <div className="live-card__actions">
                    <Link href={`/astrologers/${expert.slug}`} className="primary" aria-label={`Chat with ${expert.name}`}><MessageCircle size={15} /></Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="live-strip__more"><Link href="/astrologers" className="button button--ghost">{t("live.viewAll")} <ArrowRight size={16} /></Link></div>
        </section>
      )}

      <div className="shell" style={{ paddingBlock: "10px 20px" }}>
        <div className="cta-banner cta-banner--dark reveal">
          <div className="cta-banner__copy">
            <strong>{t("ctaAsk.title")}</strong>
            <span>{t("ctaAsk.body")}</span>
          </div>
          <Link href="/ask" className="button button--light">{t("ctaAsk.cta")} <ArrowRight size={16} /></Link>
        </div>
      </div>

      <div className="shell" style={{ paddingBlock: "10px 20px" }}>
        <div className="cta-banner reveal">
          <div className="cta-banner__copy">
            <strong>{t("ctaGemstones.title")}</strong>
            <span>{t("ctaGemstones.body")}</span>
          </div>
          <Link href="/gemstones" className="button button--light">{t("ctaGemstones.cta")} <ArrowRight size={16} /></Link>
        </div>
      </div>

      <section className="section shell" id="services" aria-label={t("aria.services")}>
        <div className="section-heading reveal">
          <div><p className="eyebrow"><span /> {t("services.eyebrow")}</p><h2>{t("services.headline")}<br /><em>{t("services.headlineEm")}</em></h2></div>
          <p>{t("services.subhead")}</p>
        </div>
        <div className="service-grid">
          {services.slice(0, 5).map((service, index) => {
            const Icon = iconMap[service.icon as keyof typeof iconMap] ?? Sparkles;
            return (
              <article className={`service-card reveal ${index === 0 ? "service-card--featured" : ""}`} key={service.id}>
                <div className="service-card__top">
                  <span className="service-icon"><Icon size={22} strokeWidth={1.4} /></span>
                  <span className="service-index">0{index + 1}</span>
                </div>
                <p>{service.category} · {service.duration} min</p>
                <h3>{service.title}</h3>
                <p className="service-description">{service.description}</p>
                <div className="service-card__footer"><span>{t("services.from")} <strong>₹{service.price}</strong></span><Link href={`/book?service=${service.id}`} aria-label={`Book ${service.title}`}><ArrowRight size={18} /></Link></div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="tools-strip shell" id="tools" aria-label={t("aria.tools")}>
        {freeToolGroups.map(({ groupKey, tools }) => (
          <div className="tools-group" key={groupKey}>
            <p className="tools-group__label">{t(`tools.groups.${groupKey}`)}</p>
            <div className="tools-grid">
              {tools.map(({ icon: Icon, key, href }) => (
                <Link href={href} className="tool-card reveal" key={`${key}-${href}`}>
                  <span><Icon size={19} strokeWidth={1.5} /></span>
                  <div><strong>{t(`tools.${key}.label`)}</strong><small>{t(`tools.${key}.note`)}</small></div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="horoscope-strip shell" aria-label={t("aria.horoscope")}>
        <div className="horoscope-banner reveal">
          <HeroVideo
            posterSrc="/images/horoscope-hero.jpg"
            mp4Src="/videos/horoscope-hero.mp4"
            webmSrc="/videos/horoscope-hero.webm"
            label="daily horoscope video"
            fill
          />
        </div>
        <div className="section-heading reveal">
          <div><p className="eyebrow"><span /> {t("horoscopeStrip.eyebrow")}</p><h2 style={{ fontSize: "clamp(32px,3.4vw,46px)" }}>{t("horoscopeStrip.headline")}<br /><em>{t("horoscopeStrip.headlineEm")}</em></h2></div>
          <div className="section-heading__cta-block">
            <p>{t("horoscopeStrip.body")}</p>
            <Link href="/horoscope" className="button button--small">{t("horoscopeStrip.cta")} <ArrowRight size={14} /></Link>
          </div>
        </div>
        <HomeHoroscopeTeaser
          signs={ZODIAC_SIGNS.map((entry) => ({ key: entry.key, name: entry.name, symbol: entry.symbol }))}
          initialSign={defaultSign.key}
          initialContent={defaultHoroscope?.content ?? t("horoscopeStrip.fallback")}
          initialDateLabel={new Date(`${defaultHoroscope?.date ?? new Date().toISOString().slice(0, 10)}T00:00:00`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
        />
      </section>

      <section className="method-section" id="method">
        <div className="shell method-grid">
          <div className="method-visual reveal">
            <Image src="/images/orbital-system.jpg" alt="Celestial planetary system" fill sizes="(max-width: 800px) 90vw, 44vw" />
            <div className="orbit-label orbit-label--one"><span /> {t("method.moonSign")}<br /><strong>Taurus</strong></div>
            <div className="orbit-label orbit-label--two"><span /> {t("method.currentDasha")}<br /><strong>Jupiter</strong></div>
          </div>
          <div className="method-copy reveal">
            <p className="eyebrow"><span /> {t("method.eyebrow")}</p>
            <h2>{t("method.headline")}<br /><em>{t("method.headlineEm")}</em></h2>
            <p>{t("method.body")}</p>
            <ol className="method-list">
              <li><span>01</span><div><strong>{t("method.step1Title")}</strong><p>{t("method.step1Body")}</p></div></li>
              <li><span>02</span><div><strong>{t("method.step2Title")}</strong><p>{t("method.step2Body")}</p></div></li>
              <li><span>03</span><div><strong>{t("method.step3Title")}</strong><p>{t("method.step3Body")}</p></div></li>
            </ol>
            <Link href="/dashboard" className="text-arrow">{t("method.dashboardCta")} <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <div className="shell" style={{ paddingTop: 70 }}>
        <div className="promo-banner reveal">
          <div className="promo-banner__copy">
            <strong>{t("ctaGuide.title")}</strong>
            <span>{t("ctaGuide.body")}</span>
          </div>
          <Link href="/astrologers" className="button button--light">{t("ctaGuide.cta")} <ArrowRight size={16} /></Link>
        </div>
      </div>

      {testimonials.length > 0 && (
        <section className="section shell stories" id="stories">
          <div className="section-heading section-heading--center reveal">
            <div><p className="eyebrow"><span /> {t("stories.eyebrow")}</p><h2>{t("stories.headline")}<br /><em>{t("stories.headlineEm")}</em></h2></div>
          </div>
          <div className="story-grid">
            {testimonials.map((review, index) => (
              <blockquote className="story-card reveal" key={index}>
                <Quote size={22} strokeWidth={1.2} />
                <p>&ldquo;{review.body}&rdquo;</p>
                <footer><span className="story-avatar">{review.reviewerName.charAt(0)}</span><div><strong>{review.reviewerName}</strong><small>{review.rating}{t("stories.ratingSuffix")}</small></div></footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <section className="referral-promo shell reveal">
        <div className="referral-promo__copy">
          <p className="eyebrow"><span /> {t("referral.eyebrow")}</p>
          <h2 style={{ fontSize: "clamp(30px,3.2vw,42px)" }}>{t("referral.headline")}<br /><em>{t("referral.headlineEm")}</em></h2>
          <p>{t("referral.body", { referrerReward: REFERRAL_REFERRER_REWARD, refereeReward: REFERRAL_REFEREE_REWARD })}</p>
        </div>
        <Link href="/dashboard/referrals" className="button">{t("referral.cta")} <ArrowRight size={17} /></Link>
      </section>

      <section className="cta shell reveal">
        <div className="cta-zodiac" aria-hidden="true">✦</div>
        <p className="eyebrow"><span /> {t("finalCta.eyebrow")}</p>
        <h2>{t("finalCta.headline")}<br /><em>{t("finalCta.headlineEm")}</em></h2>
        <p>{t("finalCta.body")}</p>
        <Link href="/book" className="button button--light">{t("finalCta.cta")} <ArrowRight size={17} /></Link>
      </section>

      <SiteFooter />
    </main>
  );
}
