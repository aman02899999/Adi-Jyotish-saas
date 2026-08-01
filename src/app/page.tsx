import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Gem,
  GraduationCap,
  Hash,
  Heart,
  HeartHandshake,
  HeartPulse,
  Home,
  MessageCircle,
  Orbit,
  PhoneCall,
  Quote,
  ScrollText,
  Sparkles,
  Star,
  Sun,
  Users,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { JsonLd } from "@/components/json-ld";
import { getSiteUrl } from "@/lib/site-url";
import { getFeaturedTestimonials, getHomepageStats, getLivePractitioners, getOnlineNowCount, getSeniorAstrologers } from "@/lib/homepage";
import { getPublishedServices } from "@/lib/services";
import { getDailyHoroscope, ZODIAC_SIGNS } from "@/lib/horoscopes";
import { HomeHoroscopeTeaser } from "@/components/home-horoscope-teaser";

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
  { icon: Heart, label: "Love & Relationships", note: "Understand the heart's timing", query: "relationship" },
  { icon: Users, label: "Marriage", note: "Compatibility & muhurat", query: "marriage" },
  { icon: BriefcaseBusiness, label: "Career & Business", note: "Growth cycles & timing", query: "career" },
  { icon: HeartPulse, label: "Health & Wellness", note: "Vitality through the chart", query: "health" },
  { icon: Home, label: "Family & Home", note: "Harmony & remedies", query: "vastu" },
  { icon: GraduationCap, label: "Education", note: "Focus & academic timing", query: "education" },
];

const freeTools = [
  { icon: Sun, label: "Daily Horoscope", note: "Today's forecast by your sign", href: "/horoscope" },
  { icon: MessageCircle, label: "Ask AI a Question", note: "Instant answer, one question", href: "/ask" },
  { icon: Gem, label: "Gemstone Match", note: "Free AI recommendation", href: "/gemstones/recommend" },
  { icon: HeartHandshake, label: "Kundli Matching", note: "Free compatibility reading", href: "/kundli-matching" },
  { icon: CalendarDays, label: "Panchang Today", note: "Tithi, nakshatra & muhurat", href: "/panchang" },
  { icon: Hash, label: "Numerology", note: "Life Path & Destiny numbers", href: "/numerology" },
  { icon: ScrollText, label: "Full Kundli Report", note: "Your complete birth chart", href: "/kundli" },
];

export default async function HomePage() {
  const defaultSign = ZODIAC_SIGNS[0];
  const [services, stats, liveExperts, testimonials, seniorAstrologers, onlineCount, defaultHoroscope] = await Promise.all([getPublishedServices(), getHomepageStats(), getLivePractitioners(), getFeaturedTestimonials(), getSeniorAstrologers(), getOnlineNowCount(), getDailyHoroscope(defaultSign.key).catch(() => null)]);
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
      <SiteHeader />

      <section className="hero shell">
        <div className="hero-copy reveal">
          <p className="eyebrow"><span /> Ancient clarity, beautifully modern</p>
          <h1>Your stars.<br /><em>Your story.</em></h1>
          <p className="hero-lead">
            Authentic Vedic astrology translated into thoughtful, personal guidance for the life you are living now.
          </p>
          <div className="hero-actions">
            <Link href="/dashboard" className="button">Explore your chart <ArrowRight size={17} /></Link>
            <Link href="#method" className="button button--ghost">How it works</Link>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true">
              {liveExperts.slice(0, 3).map((expert) => <span key={expert.id}>{expert.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>)}
            </div>
            <div><strong>{stats.averageRating || "—"}</strong> <span className="stars">★★★★★</span><small>{stats.consultationsDelivered >= 100 ? `Trusted by ${stats.consultationsDelivered}+ seekers` : "Trusted by a growing community"}</small></div>
          </div>
        </div>

        <div className="hero-art reveal reveal--delay">
          <div className="hero-art__halo" />
          <Image
            src="/images/vedic-hero.jpg"
            alt="Jyotish astrology app surrounded by Vedic symbols"
            fill
            priority
            sizes="(max-width: 800px) 100vw, 58vw"
          />
          <div className="floating-note floating-note--top"><Sparkles size={15} /> Personal to your birth time</div>
          <div className="floating-note floating-note--bottom"><Orbit size={17} /><span><strong>Jupiter returns</strong><small>A new cycle begins</small></span></div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Jyotish highlights">
        <div className="shell trust-grid">
          <div><strong>{stats.consultationsDelivered >= 100 ? `${stats.consultationsDelivered}+` : stats.consultationsDelivered}</strong><span>Consultations delivered</span></div>
          <div><strong>{stats.practitionerCount}</strong><span>Vedic astrologers</span></div>
          <div><strong>{stats.averageRating || "—"}/5</strong><span>Average reading</span></div>
          <div><strong>100%</strong><span>Private & personal</span></div>
        </div>
      </section>

      <section className="category-strip shell" aria-label="Browse by concern">
        <div className="section-heading reveal">
          <div><p className="eyebrow"><span /> Browse by concern</p><h2 style={{ fontSize: "clamp(32px,3.4vw,46px)" }}>What&apos;s on your<br /><em>mind today?</em></h2></div>
        </div>
        <div className="category-grid">
          {categories.map(({ icon: Icon, label, note, query }) => (
            <Link href={`/astrologers?q=${encodeURIComponent(query)}`} className="category-tile reveal" key={label}>
              <span><Icon size={21} strokeWidth={1.4} /></span>
              <strong>{label}</strong>
              <small>{note}</small>
            </Link>
          ))}
        </div>
      </section>

      {seniorMain.length > 0 && (
        <section className="senior-strip shell" aria-label="Our most senior astrologers">
          <div className="section-heading reveal">
            <div><p className="eyebrow"><span /> Our most senior astrologers</p><h2 style={{ fontSize: "clamp(32px,3.4vw,46px)" }}>Decades of wisdom,<br /><em>ready to guide you.</em></h2></div>
          </div>
          <div className="senior-main-grid">
            {seniorMain.map((expert) => (
              <article className="senior-main-card reveal" key={expert.id}>
                <div className="senior-main-card__photo">
                  {expert.photoUrl ? <img src={expert.photoUrl} alt={expert.name} /> : <span>{expert.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>}
                  {expert.verified && <em><CheckCircle2 size={13} /> Verified</em>}
                </div>
                <div className="senior-main-card__body">
                  <p className="senior-main-card__title">{expert.title}</p>
                  <h3>{expert.name}</h3>
                  <div className="senior-main-card__meta">
                    <span>{expert.experienceYears}+ years experience</span>
                    <span>₹{expert.chatRatePerMinute}/min</span>
                  </div>
                  <p className="senior-main-card__bio">{expert.bio}</p>
                  <div className="senior-main-card__tags">
                    {expert.specialties.split(",").slice(0, 7).map((tag) => <span key={tag}>{tag.trim()}</span>)}
                  </div>
                  <div className="senior-main-card__actions">
                    <Link href={`/astrologers/${expert.slug}`} className="button">View profile <ArrowRight size={15} /></Link>
                    <Link href={`/book?practitioner=${expert.id}`} className="button button--ghost">Book consultation</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {seniorRest.length > 0 && (
            <div className="senior-grid">
              {seniorRest.map((expert) => (
                <Link href={`/astrologers/${expert.slug}`} className="senior-card reveal" key={expert.id}>
                  <div className="senior-card__avatar">
                    {expert.photoUrl ? <img src={expert.photoUrl} alt={expert.name} /> : <span>{expert.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>}
                  </div>
                  <strong>{expert.name}</strong>
                  <span>{expert.title}</span>
                  <small>{expert.experienceYears} yrs · ₹{expert.chatRatePerMinute}/min</small>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {liveExperts.length > 0 && (
        <section className="live-strip shell" aria-label="Astrologers online now">
          <div className="live-strip__head reveal">
            <div>
              <p className="live-pulse"><i /> {onlineCount} astrologer{onlineCount === 1 ? "" : "s"} online now</p>
              <h2 style={{ margin: 0, font: "400 clamp(34px,3.8vw,50px)/1.02 var(--serif)", letterSpacing: "-.04em" }}>Talk to a guide<br /><em style={{ color: "var(--copper)" }}>right now.</em></h2>
            </div>
            <p style={{ maxWidth: 360, color: "var(--muted)", fontSize: 13, lineHeight: 1.75 }}>Chat or call instantly, pay only for the minutes you use. Every guide below is studio-reviewed.</p>
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
                    <span>{expert.online ? "Online now" : "Offline"}</span>
                  </div>
                </div>
                <div className="live-card__rating"><Star size={13} fill="currentColor" /><strong>{expert.rating ?? "New"}</strong><small>{expert.reviewCount} review{expert.reviewCount === 1 ? "" : "s"} · {expert.experienceYears} yrs</small></div>
                <div className="live-card__tags"><span>{expert.specialties}</span></div>
                <div className="live-card__foot">
                  <div className="live-card__price"><strong>₹{expert.chatRatePerMinute}<small style={{ display: "inline", fontSize: 9 }}>/min</small></strong><small>Chat or call</small></div>
                  <div className="live-card__actions">
                    <Link href={`/astrologers/${expert.slug}`} aria-label={`Chat with ${expert.name}`}><MessageCircle size={15} /></Link>
                    <Link href={`/astrologers/${expert.slug}`} className="primary" aria-label={`Call ${expert.name}`}><PhoneCall size={15} /></Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="live-strip__more"><Link href="/astrologers" className="button button--ghost">View all astrologers <ArrowRight size={16} /></Link></div>
        </section>
      )}

      <div className="shell" style={{ paddingBlock: "10px 20px" }}>
        <div className="promo-banner promo-banner--dark reveal">
          <div className="promo-banner__copy">
            <strong>Or ask Shree Santram Shashtri instantly.</strong>
            <span>Our AI Jyotish guide answers one focused question in under a minute. Your first reading is free.</span>
          </div>
          <Link href="/ask" className="button button--light">Ask now <ArrowRight size={16} /></Link>
        </div>
      </div>

      <div className="shell" style={{ paddingBlock: "10px 20px" }}>
        <div className="promo-banner reveal">
          <div className="promo-banner__copy">
            <strong>Wear what the sky recommends.</strong>
            <span>Shop certified, natural Vedic gemstones — chosen for your zodiac sign and planetary influence.</span>
          </div>
          <Link href="/gemstones" className="button button--light">Buy Gemstones <ArrowRight size={16} /></Link>
        </div>
      </div>

      <section className="section shell" id="services">
        <div className="section-heading reveal">
          <div><p className="eyebrow"><span /> Find your clarity</p><h2>Guidance for every<br /><em>chapter of life.</em></h2></div>
          <p>Every reading combines classical Jyotish principles with warm, grounded guidance you can put into practice.</p>
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
                <div className="service-card__footer"><span>From <strong>₹{service.price}</strong></span><Link href={`/book?service=${service.id}`} aria-label={`Book ${service.title}`}><ArrowRight size={18} /></Link></div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="tools-strip shell" aria-label="Free astrology tools">
        <div className="tools-grid">
          {freeTools.map(({ icon: Icon, label, note, href }) => (
            <Link href={href} className="tool-card reveal" key={label}>
              <span><Icon size={19} strokeWidth={1.5} /></span>
              <div><strong>{label}</strong><small>{note}</small></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="horoscope-strip shell" aria-label="Your daily horoscope">
        <div className="section-heading reveal">
          <div><p className="eyebrow"><span /> Your daily horoscope</p><h2 style={{ fontSize: "clamp(32px,3.4vw,46px)" }}>Pick your sign,<br /><em>see today&rsquo;s sky.</em></h2></div>
          <p>Choose Today, Tomorrow, this week, or this month — every reading is generated fresh from the current planetary transits.</p>
        </div>
        <HomeHoroscopeTeaser
          signs={ZODIAC_SIGNS.map((entry) => ({ key: entry.key, name: entry.name, symbol: entry.symbol }))}
          initialSign={defaultSign.key}
          initialContent={defaultHoroscope?.content ?? "Today's reading is not available right now. Please check back shortly."}
          initialDateLabel={new Date(`${defaultHoroscope?.date ?? new Date().toISOString().slice(0, 10)}T00:00:00`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
        />
      </section>

      <section className="method-section" id="method">
        <div className="shell method-grid">
          <div className="method-visual reveal">
            <Image src="/images/orbital-system.jpg" alt="Celestial planetary system" fill sizes="(max-width: 800px) 90vw, 44vw" />
            <div className="orbit-label orbit-label--one"><span /> Moon sign<br /><strong>Taurus</strong></div>
            <div className="orbit-label orbit-label--two"><span /> Current dasha<br /><strong>Jupiter</strong></div>
          </div>
          <div className="method-copy reveal">
            <p className="eyebrow"><span /> The Jyotish method</p>
            <h2>Rooted in tradition.<br /><em>Made for today.</em></h2>
            <p>We calculate your sidereal birth chart using the exact time and place you arrived, then place it in the hands of a trained Vedic guide.</p>
            <ol className="method-list">
              <li><span>01</span><div><strong>Map your sky</strong><p>Precise planetary positions reveal your natural patterns.</p></div></li>
              <li><span>02</span><div><strong>Understand your season</strong><p>Dashas and transits show what is unfolding now.</p></div></li>
              <li><span>03</span><div><strong>Move with clarity</strong><p>Leave with grounded guidance and practical next steps.</p></div></li>
            </ol>
            <Link href="/dashboard" className="text-arrow">See your cosmic dashboard <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <div className="shell" style={{ paddingTop: 70 }}>
        <div className="promo-banner reveal">
          <div className="promo-banner__copy">
            <strong>Prefer a live guide?</strong>
            <span>Chat instantly with an available astrologer — pay only for the minutes you use, no subscription required.</span>
          </div>
          <Link href="/astrologers" className="button button--light">Find a guide <ArrowRight size={16} /></Link>
        </div>
      </div>

      {testimonials.length > 0 && (
        <section className="section shell stories" id="stories">
          <div className="section-heading section-heading--center reveal">
            <div><p className="eyebrow"><span /> From our community</p><h2>Clarity changes<br /><em>everything.</em></h2></div>
          </div>
          <div className="story-grid">
            {testimonials.map((review, index) => (
              <blockquote className="story-card reveal" key={index}>
                <Quote size={22} strokeWidth={1.2} />
                <p>&ldquo;{review.body}&rdquo;</p>
                <footer><span className="story-avatar">{review.reviewerName.charAt(0)}</span><div><strong>{review.reviewerName}</strong><small>{review.rating}/5 reading</small></div></footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <section className="cta shell reveal">
        <div className="cta-zodiac" aria-hidden="true">✦</div>
        <p className="eyebrow"><span /> Begin with your birth chart</p>
        <h2>The sky remembers<br /><em>the moment you arrived.</em></h2>
        <p>Discover what it has to say about where you are going.</p>
        <Link href="/book" className="button button--light">Begin your reading <ArrowRight size={17} /></Link>
      </section>

      <SiteFooter />
    </main>
  );
}
