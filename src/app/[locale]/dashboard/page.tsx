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
  Moon,
  ShieldAlert,
  Star,
  SunMedium,
  UserRound,
} from "lucide-react";
import { MemberAppShell } from "@/components/member-app-shell";
import { CosmicProfileShareCard } from "@/components/cosmic-profile-share-card";
import { KundliChartDiagram, rashiName } from "@/components/kundli-chart-diagram";
import { getNextMemberBooking } from "@/lib/member-bookings";
import { getCurrentMember } from "@/lib/member-auth";
import { getPublishedServices } from "@/lib/services";
import { getCosmicWeather } from "@/lib/transit-alerts";
import { BADGE_MILESTONES, recordDailyVisit } from "@/lib/streaks";
import { buildHouseGrid, buildKundliChart, KundliEngineError } from "@/lib/kundli-engine";
import { formatDegree, NAKSHATRAS } from "@/lib/astro-engine";
import { getVariant, recordExperimentImpression } from "@/lib/experiments";
import { buildMemberToday, runningDasha, windowStatus } from "@/lib/member-today";
import { dateInTimeZone } from "@/lib/scheduling";
import { REFERENCE_LOCATION } from "@/lib/panchang";
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
  const [services, nextBooking, weather, streak] = await Promise.all([
    getPublishedServices(),
    getNextMemberBooking(member.email),
    getCosmicWeather(member, member.id),
    recordDailyVisit(member.id),
  ]);
  const firstName = member.name.split(" ")[0];
  const kundli = buildDashboardKundli(member);
  const moon = kundli?.chart.positions.find((position) => position.graha === "moon");
  const sun = kundli?.chart.positions.find((position) => position.graha === "sun");

  // Today's sky for the member's own city: the birth place on their chart, else New Delhi.
  const timeZone = kundli?.chart.timezone ?? REFERENCE_LOCATION.timeZone;
  const now = new Date();
  const todaySky = buildMemberToday({
    // The date in that city, not the studio's: west of India, the studio's day turns over first.
    civilDate: dateInTimeZone(now, timeZone),
    latitude: kundli?.chart.latitude ?? REFERENCE_LOCATION.latitude,
    longitude: kundli?.chart.longitude ?? REFERENCE_LOCATION.longitude,
    timeZone,
    placeLabel: kundli ? kundli.chart.matchedPlace.split(",")[0] : "New Delhi",
  });
  const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone });
  const span = (window: { start: string; end: string }) => `${clock(window.start)} – ${clock(window.end)}`;
  const hour = Number(now.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", timeZone });
  const abhijitStatus = todaySky.abhijit ? windowStatus(todaySky.abhijit, now) : null;
  const abhijitMinutes = todaySky.abhijit ? Math.round((Date.parse(todaySky.abhijit.end) - Date.parse(todaySky.abhijit.start)) / 60000) : 0;
  const dasha = kundli && moon ? runningDasha(moon.longitude, kundli.chart.birthInstant, now) : null;
  const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", year: "numeric" });

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
      <section className="today-band" aria-label="Today">
        <div className="today-band__greet">
          <p>{greeting}, {firstName}</p>
          <h1>Your day, <em>read from the sky</em></h1>
          <small><SunMedium size={14} /> {today} · {todaySky.placeLabel}</small>
        </div>
        <div className="today-band__chips">
          <div><small>Tithi</small><strong>{todaySky.tithi}</strong><span>{todaySky.vara}</span></div>
          <div><small>Nakshatra</small><strong>{todaySky.nakshatra.name}</strong>{todaySky.nakshatra.endsAt && <span>until {clock(todaySky.nakshatra.endsAt)}</span>}</div>
          {todaySky.abhijit && <div className="today-band__chip--good"><small>Best window</small><strong>{span(todaySky.abhijit)}</strong><span>Abhijit Muhurat</span></div>}
          {todaySky.rahuKala && <div className="today-band__chip--avoid"><small><ShieldAlert size={12} /> Avoid</small><strong>{span(todaySky.rahuKala)}</strong><span>Rahu Kaal</span></div>}
        </div>
      </section>

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
          <div className="card-heading"><div><p>Birth chart <span className="mini-tag">Lahiri</span></p><h2>Kundli</h2></div><Link className="card-heading__action" href="/dashboard/kundli" aria-label="Open full Kundli" title="Open full Kundli"><MoreHorizontal size={19} /></Link></div>
          {kundli ? (
            <>
              <div className="kundli-art">
                <KundliChartDiagram houses={kundli.houses} />
              </div>
              <div className="chart-progress">
                <div><small>Lagna (Ascendant)</small><strong>{rashiName(kundli.chart.ascendantRashiIndex)} · {formatDegree(kundli.chart.ascendantDegree)}</strong>{moon && <p>Moon in {rashiName(moon.rashiIndex)}, {NAKSHATRAS[moon.nakshatraIndex]} nakshatra.</p>}</div>
              </div>
              <Link href="/dashboard/kundli" className="button button--small kundli-card__cta">See full Kundli <ArrowUpRight size={14} /></Link>
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
          <div className="muhurat-time"><Clock3 size={18} /><div><strong>{nextBooking ? new Date(nextBooking.scheduledAt).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" }) : todaySky.abhijit ? span(todaySky.abhijit) : "Not today"}</strong><small>{nextBooking ? `${new Date(nextBooking.scheduledAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} · ${nextBooking.status}` : todaySky.abhijit ? `Abhijit Muhurat · ${abhijitMinutes} min · ${abhijitStatus === "now" ? "open now" : abhijitStatus === "passed" ? "passed today" : "later today"}` : `No Abhijit Muhurat on ${todaySky.vara}`}</small></div></div>
          <p>{nextBooking ? `${nextBooking.serviceTitle} with ${nextBooking.practitionerName ?? "your Jyotish guide"} is reserved. Your chart will be prepared before the call.` : `Computed for ${todaySky.placeLabel}. Favourable for an important conversation, a new agreement, or beginning focused work.`}</p>
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
          <div className="insight-icon"><Moon size={21} /></div>
          <div><p>Your chart, right now</p><h2>Current period</h2></div>
          {dasha ? (
            <p><strong>{dasha.maha.lord.replace(/ \(.*\)/, "")} Mahadasha</strong> until {monthYear(dasha.maha.end)}{dasha.antar && <>, with <strong>{dasha.antar.lord.replace(/ \(.*\)/, "")}</strong> as the sub-period until {monthYear(dasha.antar.end)}</>}. These periods set the tone of the years you are living through.</p>
          ) : (
            <p>Add your exact birth time and place to see which planetary period (dasha) you are living through, and when it changes.</p>
          )}
          <Link href={dasha ? "/dashboard/kundli" : "/onboarding"}>{dasha ? "See every period in your Kundli" : "Complete birth profile"} <ArrowRight size={14} /></Link>
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
