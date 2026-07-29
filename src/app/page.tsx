import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  GraduationCap,
  Heart,
  HeartHandshake,
  HeartPulse,
  Home,
  MessageCircle,
  Orbit,
  PhoneCall,
  Quote,
  ScrollText,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Users,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { BrandMark } from "@/components/brand-mark";
import { getPublishedServices } from "@/lib/services";

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
  { icon: Heart, label: "Love & Relationships", note: "Understand the heart's timing" },
  { icon: Users, label: "Marriage", note: "Compatibility & muhurat" },
  { icon: BriefcaseBusiness, label: "Career & Business", note: "Growth cycles & timing" },
  { icon: HeartPulse, label: "Health & Wellness", note: "Vitality through the chart" },
  { icon: Home, label: "Family & Home", note: "Harmony & remedies" },
  { icon: GraduationCap, label: "Education", note: "Focus & academic timing" },
];

const liveExperts = [
  { name: "Acharya Devika Rao", specialty: "Vedic Astrology · Marriage", online: true, rating: 4.9, reviews: "2,340", price: 22, experience: 14 },
  { name: "Pandit Rohan Mehta", specialty: "Career & Finance", online: true, rating: 4.8, reviews: "1,870", price: 18, experience: 11 },
  { name: "Guruji Aditya Nair", specialty: "Vastu & Numerology", online: false, rating: 4.9, reviews: "3,120", price: 25, experience: 19 },
  { name: "Smt. Kavita Iyer", specialty: "Love & Relationships", online: true, rating: 4.7, reviews: "980", price: 15, experience: 7 },
  { name: "Acharya Manoj Tiwari", specialty: "Health & Wellness", online: true, rating: 4.9, reviews: "2,560", price: 20, experience: 16 },
  { name: "Pandit Suresh Bhatt", specialty: "Family & Progeny", online: false, rating: 4.8, reviews: "1,430", price: 19, experience: 12 },
];

const freeTools = [
  { icon: Sun, label: "Daily Horoscope", note: "Today's forecast by moon sign" },
  { icon: ScrollText, label: "Free Kundli", note: "Instant birth chart report" },
  { icon: HeartHandshake, label: "Kundli Matching", note: "Compatibility for marriage" },
  { icon: CalendarDays, label: "Panchang Today", note: "Tithi, nakshatra & muhurat" },
];

export default async function HomePage() {
  const services = await getPublishedServices();

  return (
    <main className="marketing-page">
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
              <span>AK</span><span>MS</span><span>RL</span>
            </div>
            <div><strong>4.9</strong> <span className="stars">★★★★★</span><small>Trusted by 12,000+ seekers</small></div>
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
          <div><strong>12k+</strong><span>Charts interpreted</span></div>
          <div><strong>24</strong><span>Vedic astrologers</span></div>
          <div><strong>4.9/5</strong><span>Average reading</span></div>
          <div><strong>100%</strong><span>Private & personal</span></div>
        </div>
      </section>

      <section className="category-strip shell" aria-label="Browse by concern">
        <div className="section-heading reveal">
          <div><p className="eyebrow"><span /> Browse by concern</p><h2 style={{ fontSize: "clamp(32px,3.4vw,46px)" }}>What&apos;s on your<br /><em>mind today?</em></h2></div>
        </div>
        <div className="category-grid">
          {categories.map(({ icon: Icon, label, note }) => (
            <Link href="/astrologers" className="category-tile reveal" key={label}>
              <span><Icon size={21} strokeWidth={1.4} /></span>
              <strong>{label}</strong>
              <small>{note}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="live-strip shell" aria-label="Astrologers online now">
        <div className="live-strip__head reveal">
          <div>
            <p className="live-pulse"><i /> {liveExperts.filter((e) => e.online).length} astrologers online now</p>
            <h2 style={{ margin: 0, font: "400 clamp(34px,3.8vw,50px)/1.02 var(--serif)", letterSpacing: "-.04em" }}>Talk to a guide<br /><em style={{ color: "var(--copper)" }}>right now.</em></h2>
          </div>
          <p style={{ maxWidth: 360, color: "var(--muted)", fontSize: 13, lineHeight: 1.75 }}>Chat or call instantly, pay only for the minutes you use. Every guide below is studio-reviewed.</p>
        </div>
        <div className="live-grid">
          {liveExperts.map((expert) => (
            <article className="live-card reveal" key={expert.name}>
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
              <div className="live-card__rating"><Star size={13} fill="currentColor" /><strong>{expert.rating}</strong><small>{expert.reviews} reviews · {expert.experience} yrs</small></div>
              <div className="live-card__tags"><span>{expert.specialty}</span></div>
              <div className="live-card__foot">
                <div className="live-card__price"><strong>₹{expert.price}<small style={{ display: "inline", fontSize: 9 }}>/min</small></strong><small>Chat or call</small></div>
                <div className="live-card__actions">
                  <Link href="/astrologers" aria-label={`Chat with a guide like ${expert.name}`}><MessageCircle size={15} /></Link>
                  <Link href="/astrologers" className="primary" aria-label={`Call a guide like ${expert.name}`}><PhoneCall size={15} /></Link>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="live-strip__more"><Link href="/astrologers" className="button button--ghost">View all astrologers <ArrowRight size={16} /></Link></div>
      </section>

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
                <div className="service-card__footer"><span>From <strong>${service.price}</strong></span><Link href={`/book?service=${service.id}`} aria-label={`Book ${service.title}`}><ArrowRight size={18} /></Link></div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="tools-strip shell" aria-label="Free astrology tools">
        <div className="tools-grid">
          {freeTools.map(({ icon: Icon, label, note }) => (
            <Link href="/dashboard" className="tool-card reveal" key={label}>
              <span><Icon size={19} strokeWidth={1.5} /></span>
              <div><strong>{label}</strong><small>{note}</small></div>
            </Link>
          ))}
        </div>
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
            <strong>Your first chat is on us.</strong>
            <span>3 free minutes with any guide — no card required to start.</span>
          </div>
          <Link href="/astrologers" className="button button--light">Claim your free chat <ArrowRight size={16} /></Link>
        </div>
      </div>

      <section className="section shell stories" id="stories">
        <div className="section-heading section-heading--center reveal">
          <div><p className="eyebrow"><span /> From our community</p><h2>Clarity changes<br /><em>everything.</em></h2></div>
        </div>
        <div className="story-grid">
          {[
            ["Maya S.", "London", "I felt seen without feeling boxed in. My reading gave language to a transition I had been quietly moving through."],
            ["Arun K.", "New York", "The timing was astonishingly precise, but it was the practical guidance that made the biggest difference."],
            ["Leah R.", "Melbourne", "Beautiful, thoughtful and grounded. I returned to the dashboard all month whenever I needed perspective."],
          ].map(([name, city, quote]) => (
            <blockquote className="story-card reveal" key={name}>
              <Quote size={22} strokeWidth={1.2} />
              <p>“{quote}”</p>
              <footer><span className="story-avatar">{name.charAt(0)}</span><div><strong>{name}</strong><small>{city}</small></div></footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="app-strip shell" aria-label="Get the app">
        <div className="app-strip__copy reveal">
          <p className="eyebrow"><span /> Take it with you</p>
          <h2>Your chart,<br /><em>in your pocket.</em></h2>
          <p>Get daily transits, instant chat with your favorite guides, and wallet top-ups from wherever you are.</p>
          <div className="app-strip__badges">
            <span className="app-badge"><Smartphone size={18} /><span><small>Download on</small><strong>App Store</strong></span></span>
            <span className="app-badge"><Smartphone size={18} /><span><small>Get it on</small><strong>Google Play</strong></span></span>
          </div>
        </div>
        <div className="app-strip__visual reveal reveal--delay">
          <div className="marketplace-orbit"><span><Smartphone size={26} /></span><i /><b /></div>
        </div>
      </section>

      <section className="cta shell reveal">
        <div className="cta-zodiac" aria-hidden="true">✦</div>
        <p className="eyebrow"><span /> Begin with your birth chart</p>
        <h2>The sky remembers<br /><em>the moment you arrived.</em></h2>
        <p>Discover what it has to say about where you are going.</p>
        <Link href="/book" className="button button--light">Begin your reading <ArrowRight size={17} /></Link>
      </section>

      <footer className="footer shell">
        <BrandMark />
        <p>Ancient wisdom for modern life.<br />Made thoughtfully in the present.</p>
        <div><Link href="#services">Readings</Link><Link href="/blog">Journal</Link><Link href="/dashboard">Dashboard</Link><Link href="/admin">Admin</Link></div>
        <small>© 2026 Jyotish Studio</small>
      </footer>
    </main>
  );
}
