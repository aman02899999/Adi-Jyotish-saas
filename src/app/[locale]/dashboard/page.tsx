import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Flame,
  MessageCircle,
  MoreHorizontal,
  ScrollText,
  Sparkles,
  Star,
  SunMedium,
  UserRound,
} from "lucide-react";
import { MemberAppShell } from "@/components/member-app-shell";
import { CosmicProfileShareCard } from "@/components/cosmic-profile-share-card";
import { KundliChartDiagram, rashiName } from "@/components/kundli-chart-diagram";
import { db, withIndexFallback } from "@/lib/firestore";
import { bookingFromDoc } from "@/app/api/bookings/route";
import { getCurrentMember } from "@/lib/member-auth";
import { getPublishedServices } from "@/lib/services";
import { getCosmicWeather } from "@/lib/transit-alerts";
import { BADGE_MILESTONES, recordDailyVisit } from "@/lib/streaks";
import { buildHouseGrid, buildKundliChart, KundliEngineError } from "@/lib/kundli-engine";
import { formatDegree, NAKSHATRAS } from "@/lib/astro-engine";
import { getVariant, recordExperimentImpression } from "@/lib/experiments";
import { computeLifePathNumber, computeDestinyNumber, computePersonalYearNumber, LUCKY_COLOR_BY_NUMBER } from "@/lib/numerology";

const ONBOARDING_CTA_LABEL: Record<string, string> = { control: "Complete birth profile", "get-my-chart": "Get my free chart" };

export const dynamic = "force-dynamic";

const SADE_SATI_LABEL = { rising: "Rising phase", peak: "Peak phase", setting: "Setting phase" } as const;
const GRAHA_LABEL = { jupiter: "Jupiter", saturn: "Saturn" } as const;

function buildDashboardKundli(member: { name: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null }) {
  if (!member.birthDate || !member.birthTime || !member.birthPlace) return null;
  try {
    const chart = buildKundliChart({ name: member.name, birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace });
    return { chart, houses: buildHouseGrid(chart) };
  } catch (error) {
    if (error instanceof KundliEngineError) return null;
    throw error;
  }
}

export default async function DashboardPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const [services, upcomingSnap, weather, streak] = await Promise.all([
    getPublishedServices(),
    // Falls back to no "next session" card (not a page crash) if the (clientEmail, scheduledAt)
    // composite index isn't built yet.
    withIndexFallback(
      () => db.collection("bookings").where("clientEmail", "==", member.email).where("scheduledAt", ">", new Date()).orderBy("scheduledAt", "asc").limit(1).get(),
      { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
    ),
    getCosmicWeather(member, member.id),
    recordDailyVisit(member.id),
  ]);
  const firstName = member.name.split(" ")[0];
  const location = member.birthPlace?.split(",")[0] || "Your location";
  const today = new Date().toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
  const nextBooking = upcomingSnap.docs[0] ? bookingFromDoc(upcomingSnap.docs[0]) : undefined;
  const kundli = buildDashboardKundli(member);
  const moon = kundli?.chart.positions.find((position) => position.graha === "moon");
  const sun = kundli?.chart.positions.find((position) => position.graha === "sun");

  const onboardingCtaVariant = kundli ? null : getVariant("dashboard-onboarding-cta", member.id);
  if (onboardingCtaVariant) {
    await recordExperimentImpression("dashboard-onboarding-cta", onboardingCtaVariant).catch((error) => console.error("Experiment impression tracking failed", error));
  }

  const lifePathNumber = member.birthDate ? computeLifePathNumber(member.birthDate) : null;
  const destinyNumber = computeDestinyNumber(member.name);
  const personalYearNumber = member.birthDate ? computePersonalYearNumber(member.birthDate) : null;
  const luckyColor = lifePathNumber ? LUCKY_COLOR_BY_NUMBER[lifePathNumber] : null;

  return (
    <MemberAppShell member={member} active="Dashboard">
      <div className="dashboard-welcome">
        <div><p>Welcome back, {firstName}</p><h1>Your cosmic overview</h1></div>
        <div className="today-pill"><SunMedium size={17} /><span><small>{location}</small>{today}</span></div>
      </div>

      {onboardingCtaVariant && (
        <section className="dashboard-onboarding">
          <p className="eyebrow"><span /> Getting started</p>
          <h2>Three steps to your first reading</h2>
          <div className="dashboard-onboarding__steps">
            <div><b>1</b><div><UserRound size={16} /><strong>Complete your birth profile</strong><small>Your exact date, time, and place of birth — this powers every chart on this page.</small></div></div>
            <div><b>2</b><div><ScrollText size={16} /><strong>See your real birth chart</strong><small>Your Kundli, Cosmic Weather, and lucky numbers appear automatically once your profile is set.</small></div></div>
            <div><b>3</b><div><MessageCircle size={16} /><strong>Ask a question or book a reading</strong><small>Get a live answer for free, or talk to a verified astrologer.</small></div></div>
          </div>
          <Link href="/onboarding" className="button">{ONBOARDING_CTA_LABEL[onboardingCtaVariant] ?? ONBOARDING_CTA_LABEL.control} <ArrowUpRight size={15} /></Link>
        </section>
      )}

      <div className="cosmic-grid">
        <article className="glass-card kundli-card">
          <div className="card-heading"><div><p>Birth chart <span className="mini-tag">Lahiri</span></p><h2>Kundli</h2></div><button aria-label="More options"><MoreHorizontal size={19} /></button></div>
          {kundli ? (
            <>
              <div className="kundli-art">
                <KundliChartDiagram houses={kundli.houses} />
              </div>
              <div className="chart-progress">
                <div><small>Lagna (Ascendant)</small><strong>{rashiName(kundli.chart.ascendantRashiIndex)} · {formatDegree(kundli.chart.ascendantDegree)}</strong>{moon && <p>Moon in {rashiName(moon.rashiIndex)}, {NAKSHATRAS[moon.nakshatraIndex]} nakshatra.</p>}</div>
              </div>
            </>
          ) : (
            <div className="kundli-empty">
              <p>Add your exact birth date, time, and place to generate your real Vedic birth chart — computed from actual planetary positions, not a template.</p>
              <Link href="/onboarding" className="button button--small">Complete birth profile <ArrowUpRight size={14} /></Link>
            </div>
          )}
        </article>

        <article className="glass-card muhurat-card">
          <div className="card-heading"><div><p>{nextBooking ? "Your calendar" : "Today’s guidance"}</p><h2>{nextBooking ? <>Upcoming<br /><em>Reading</em></> : <>Upcoming<br /><em>Muhurat</em></>}</h2></div><Star size={20} /></div>
          <div className="muhurat-time"><Clock3 size={18} /><div><strong>{nextBooking ? new Date(nextBooking.scheduledAt).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" }) : "10:42 – 11:28 AM"}</strong><small>{nextBooking ? `${new Date(nextBooking.scheduledAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} · ${nextBooking.status}` : "Abhijit Muhurat · 46 min"}</small></div></div>
          <p>{nextBooking ? `${nextBooking.serviceTitle} with ${nextBooking.practitionerName ?? "your Jyotish guide"} is reserved. Your chart will be prepared before the call.` : "Favorable for an important conversation, a new agreement, or beginning focused work."}</p>
          <Link href="/book" className="button button--small">{nextBooking ? "Book another" : "Book guidance"} <ArrowUpRight size={14} /></Link>
          <span className="card-watermark">☼</span>
        </article>

        <article className="glass-card lucky-card">
          <div className="card-heading"><div><p>Numerology</p><h2>Lucky numbers</h2></div><span className="mini-tag">Live</span></div>
          {lifePathNumber ? (
            <>
              <div className="number-row"><span><small>Life Path</small><strong>{lifePathNumber}</strong></span><span><small>Destiny</small><strong>{destinyNumber}</strong></span><span><small>This year</small><strong>{personalYearNumber}</strong></span><span><small>Color</small><strong>{luckyColor}</strong></span></div>
              <Link href="/numerology" className="button button--small">Get your full reading <ArrowUpRight size={14} /></Link>
            </>
          ) : (
            <div className="kundli-empty">
              <p>Add your exact birth date to see your real Life Path, Destiny, and yearly focus numbers — not a placeholder.</p>
              <Link href="/onboarding" className="button button--small">Complete birth profile <ArrowUpRight size={14} /></Link>
            </div>
          )}
        </article>

        <article className="glass-card weather-card" id="cosmic-weather">
          <div className="card-heading">
            <div><p>Your personal sky</p><h2>Cosmic Weather</h2></div>
            {weather?.sadeSatiPhase && <span className="mini-tag mini-tag--copper">Sade Sati · {SADE_SATI_LABEL[weather.sadeSatiPhase]}</span>}
          </div>
          {weather ? (
            <>
              <p className="weather-moon"><strong>Moon, from your natal {weather.moonSignName} Moon:</strong> {weather.moonTheme}</p>
              <div className="weather-transits">
                {weather.activeTransits.map((transit) => (
                  <div key={transit.graha} className="weather-transit">
                    <span className="weather-transit__planet">{GRAHA_LABEL[transit.graha]}{transit.isNew && <em className="mini-tag">Just shifted</em>}</span>
                    <p>{transit.theme}</p>
                  </div>
                ))}
              </div>
              <p className="weather-rahuketu">{weather.rahuKetuNote}</p>
            </>
          ) : (
            <div className="weather-empty">
              <p>Add your birth date, time, and place to unlock personal transit tracking — see exactly how today&rsquo;s sky affects your own chart, not a generic sun-sign forecast.</p>
              <Link href="/onboarding" className="button button--small">Complete birth profile <ArrowUpRight size={14} /></Link>
            </div>
          )}
        </article>

        <article className="glass-card insight-card" id="insights">
          <div className="insight-icon"><Sparkles size={21} /></div>
          <div><p>Personal intelligence</p><h2>Live Insight</h2></div>
          <p>The shift you feel is not a disruption—it is an invitation to be more visible. Choose one brave, specific action today.</p>
          <Link href="#services-list">Read full insight <ArrowRight size={14} /></Link>
          <span className="insight-star">✦</span>
        </article>

        {kundli && sun && moon && (
          <CosmicProfileShareCard
            sunRashi={rashiName(sun.rashiIndex)}
            moonRashi={rashiName(moon.rashiIndex)}
            risingRashi={rashiName(kundli.chart.ascendantRashiIndex)}
          />
        )}

        <article className="glass-card streak-card">
          <div className="card-heading"><div><p>Keep showing up</p><h2>Your streak</h2></div><Flame size={19} /></div>
          <div className="streak-count"><strong>{streak.currentStreak}</strong><span>{streak.currentStreak === 1 ? "day" : "days"} in a row</span></div>
          {streak.longestStreak > streak.currentStreak && <p className="streak-best">Best: {streak.longestStreak} days</p>}
          {streak.badges.length > 0 && (
            <div className="streak-badges">
              {BADGE_MILESTONES.filter((milestone) => streak.badges.includes(milestone.key)).map((milestone) => (
                <span key={milestone.key} className={milestone.key === streak.justEarned ? "streak-badge streak-badge--new" : "streak-badge"}>{milestone.label}</span>
              ))}
            </div>
          )}
        </article>
      </div>

      <section className="reading-strip" id="services-list">
        <div className="strip-heading"><div><p>Continue exploring</p><h2>Your readings</h2></div><Link href="/onboarding">Update birth profile <ArrowRight size={15} /></Link></div>
        <div className="reading-list">
          {services.slice(0,4).map((service,index)=><article key={service.id}><span>0{index+1}</span><div><small>{service.category} · {service.duration} min</small><h3>{service.title}</h3></div><strong>₹{service.price}</strong><Link href={`/book?service=${service.id}`} aria-label={`Book ${service.title}`}><ArrowUpRight size={17} /></Link></article>)}
        </div>
      </section>
    </MemberAppShell>
  );
}
