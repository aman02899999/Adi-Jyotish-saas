import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Heart,
  Orbit,
  Quote,
  Sparkles,
  Sun,
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

      <section className="method-section" id="method">
        <div className="shell method-grid">
          <div className="method-visual reveal">
            <Image src="/images/orbital-system.png" alt="Celestial planetary system" fill sizes="(max-width: 800px) 90vw, 44vw" />
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
        <div><Link href="#services">Readings</Link><Link href="/dashboard">Dashboard</Link><Link href="/admin">Admin</Link></div>
        <small>© 2026 Jyotish Studio</small>
      </footer>
    </main>
  );
}
