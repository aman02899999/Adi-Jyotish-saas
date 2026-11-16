import { describe, expect, it } from "vitest";
import { CalculationFlag, Planet, SiderealMode, calculatePosition, dateToJulianDay, getAyanamsaExUt, setSiderealMode } from "@swisseph/node";
import { elongation, lunarEclipses, solarEclipses } from "panchanga";
import cityRows from "@/lib/geo-data/cities.json";
import { NASA_LUNAR_ECLIPSES, NASA_SOLAR_ECLIPSES } from "@/lib/panchang-nasa-eclipses.fixture";
import {
  DEFAULT_PANCHANG_CITY, PANCHANG_CITIES, PANCHANG_MAX_YEAR, PANCHANG_MIN_YEAR, getPanchangCity, getPanchangForDate, getPanchangForMonth,
  parsePanchangDate, parsePanchangMonth, shiftPanchangDate, shiftPanchangMonth,
} from "@/lib/panchang-archive";

const normalize = (value: number) => ((value % 360) + 360) % 360;

describe("supported span", () => {
  it("covers 1950 to 2050, a hundred years and one", () => {
    expect(PANCHANG_MAX_YEAR - PANCHANG_MIN_YEAR).toBeGreaterThanOrEqual(100);
    expect(parsePanchangDate("1950-01-01")).toBe("1950-01-01");
    expect(parsePanchangDate("2050-12-31")).toBe("2050-12-31");
  });

  it("refuses dates outside the span, impossible dates and loose formats", () => {
    for (const bad of ["1949-12-31", "2051-01-01", "2026-02-30", "2026-13-01", "2026-1-5", "16-11-2026", "today", "", "2026-11-16T00:00"]) {
      expect(parsePanchangDate(bad), bad).toBeNull();
    }
    expect(parsePanchangDate("2024-02-29")).toBe("2024-02-29");
    expect(parsePanchangDate("2026-02-29")).toBeNull();
  });

  it("parses months and refuses the ones outside the span", () => {
    expect(parsePanchangMonth("2026-11")).toEqual({ year: 2026, month: 11 });
    for (const bad of ["1949-12", "2051-01", "2026-00", "2026-13", "2026-1", "2026"]) expect(parsePanchangMonth(bad), bad).toBeNull();
  });

  it("stops the previous and next links at the edges", () => {
    expect(shiftPanchangDate("2026-11-16", 1)).toBe("2026-11-17");
    expect(shiftPanchangDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftPanchangDate("1950-01-01", -1)).toBeNull();
    expect(shiftPanchangDate("2050-12-31", 1)).toBeNull();
    expect(shiftPanchangMonth(2026, 12, 1)).toBe("2027-01");
    expect(shiftPanchangMonth(1950, 1, -1)).toBeNull();
    expect(shiftPanchangMonth(2050, 12, 1)).toBeNull();
  });

  it("throws rather than computing a day it does not vouch for", () => {
    expect(() => getPanchangForDate("1900-01-01")).toThrow(RangeError);
    expect(() => getPanchangForMonth(2051, 1)).toThrow(RangeError);
  });
});

describe("cities", () => {
  it("has unique slugs and finds a city by slug", () => {
    expect(new Set(PANCHANG_CITIES.map((city) => city.slug)).size).toBe(PANCHANG_CITIES.length);
    expect(getPanchangCity("varanasi")?.name).toBe("Varanasi");
    expect(getPanchangCity("atlantis")).toBeNull();
  });

  it("places every city where the bundled place data puts it", () => {
    const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const rows = cityRows as unknown as [string, string, string, string, number, number, number][];
    // Names the data files under an older or differently spelt name.
    const dataName: Record<string, string> = { prayagraj: "allahabad" };
    for (const city of PANCHANG_CITIES) {
      const wanted = dataName[city.slug] ?? fold(city.name);
      const candidates = rows.filter((row) => row[2] === "IN" && fold(row[0]) === wanted);
      expect(candidates.length, city.name).toBeGreaterThan(0);
      const nearest = Math.min(...candidates.map((row) => Math.hypot(row[5] / 1e5 - city.latitude, row[6] / 1e5 - city.longitude)));
      // 0.05 degrees is about 5 km, which moves sunrise by well under half a minute.
      expect(nearest, city.name).toBeLessThan(0.05);
    }
  });
});

describe("a single day", () => {
  it("gives the five limbs, the day's times and the muhurat windows", () => {
    const day = getPanchangForDate("2026-11-16");
    expect(day.date).toBe("2026-11-16");
    expect(day.vara.name).toBe("Somavara"); // 16 November 2026 is a Monday.
    expect(day.tithi.number).toBeGreaterThanOrEqual(1);
    expect(day.tithi.number).toBeLessThanOrEqual(30);
    expect(day.sunrise && day.sunset && new Date(day.sunrise) < new Date(day.sunset)).toBe(true);
    expect(day.muhurta.rahuKala && day.muhurta.abhijit).toBeTruthy();
  });

  it("always gets the weekday right across the whole span", () => {
    const names = ["Ravivara", "Somavara", "Mangalavara", "Budhavara", "Guruvara", "Shukravara", "Shanivara"];
    for (let year = PANCHANG_MIN_YEAR; year <= PANCHANG_MAX_YEAR; year += 3) {
      for (const monthDay of ["01-01", "06-21", "12-31"]) {
        const date = `${year}-${monthDay}`;
        expect(getPanchangForDate(date, DEFAULT_PANCHANG_CITY, { eclipses: false }).vara.name, date).toBe(names[new Date(`${date}T00:00:00Z`).getUTCDay()]);
      }
    }
  });

  it("differs by place: sunrise comes earlier in the east", () => {
    const date = "2026-11-16";
    const east = getPanchangForDate(date, getPanchangCity("guwahati")!);
    const west = getPanchangForDate(date, getPanchangCity("mumbai")!);
    expect(new Date(east.sunrise!).getTime()).toBeLessThan(new Date(west.sunrise!).getTime() - 45 * 60_000);
  });

  it("returns every day of a month, leap February included", () => {
    expect(getPanchangForMonth(2024, 2).map((day) => day.date)).toHaveLength(29);
    const november = getPanchangForMonth(2026, 11);
    expect(november).toHaveLength(30);
    expect(november[15].tithi.number).toBe(getPanchangForDate("2026-11-16").tithi.number);
  });
});

/**
 * Second engine. The Panchang comes from `panchanga`, which stands on astronomy-engine. Swiss
 * Ephemeris is an unrelated implementation, so agreement between the two is evidence neither has
 * drifted. About a thousand sunrises spread over the century are compared.
 */
describe("agreement with Swiss Ephemeris, 1950 to 2050", () => {
  setSiderealMode(SiderealMode.Lahiri);

  function swissLimbs(at: Date) {
    const jd = dateToJulianDay(at);
    const ayanamsa = getAyanamsaExUt(jd, CalculationFlag.SwissEphemeris);
    const sun = calculatePosition(jd, Planet.Sun, CalculationFlag.SwissEphemeris).longitude;
    const moon = calculatePosition(jd, Planet.Moon, CalculationFlag.SwissEphemeris).longitude;
    return {
      tithi: Math.floor(normalize(moon - sun) / 12) + 1,
      nakshatra: Math.floor(normalize(moon - ayanamsa) / (360 / 27)),
      yoga: Math.floor(normalize(moon + sun - 2 * ayanamsa) / (360 / 27)),
    };
  }

  it("names the same tithi, nakshatra and yoga at sunrise", () => {
    // A limb that changes within minutes of sunrise can fall either side of the line on two
    // honest engines; those days are counted and capped instead of being called errors.
    const graceMs = 5 * 60_000;
    let compared = 0;
    let onTheLine = 0;
    const disagreements: string[] = [];
    const start = Date.UTC(PANCHANG_MIN_YEAR, 0, 1);
    const end = Date.UTC(PANCHANG_MAX_YEAR, 11, 31);
    for (let time = start; time <= end; time += 37 * 86_400_000) {
      const date = new Date(time).toISOString().slice(0, 10);
      const day = getPanchangForDate(date, PANCHANG_CITIES[compared % PANCHANG_CITIES.length], { eclipses: false });
      const sunrise = new Date(day.sunrise!);
      const swiss = swissLimbs(sunrise);
      compared += 1;
      const checks: [string, number, number, string][] = [
        ["tithi", day.tithi.number, swiss.tithi, day.tithi.endsAt],
        ["nakshatra", day.nakshatra.index, swiss.nakshatra, day.nakshatra.endsAt],
        ["yoga", day.yoga.index, swiss.yoga, day.yoga.endsAt],
      ];
      for (const [limb, ours, theirs, endsAt] of checks) {
        if (ours === theirs) continue;
        // Our limb ending moments after sunrise is the only way an honest disagreement arises.
        if (new Date(endsAt).getTime() - sunrise.getTime() < graceMs) onTheLine += 1;
        else disagreements.push(`${date} ${limb}: ${ours} vs Swiss ${theirs}`);
      }
    }
    expect(compared).toBeGreaterThan(990);
    expect(disagreements).toEqual([]);
    expect(onTheLine).toBeLessThanOrEqual(5);
  }, 60_000);
});

/**
 * Dates fixed by sources outside this codebase. A tithi follows from the angle between the Sun and
 * the Moon, so an eclipse pins it exactly: a solar eclipse can only happen at Amavasya and a lunar
 * one only at Purnima. The eclipse dates below are the well-recorded ones seen from India.
 */
describe("anchors from the public record", () => {
  const delhi = DEFAULT_PANCHANG_CITY;

  it("knows the first Republic Day, 26 January 1950, was a Thursday", () => {
    expect(getPanchangForDate("1950-01-26", delhi).vara.name).toBe("Guruvara");
  });

  it.each([
    ["1980-02-16", "sun"], // total solar eclipse across India
    ["1995-10-24", "sun"], // total solar eclipse on the day after Diwali night
    ["2009-07-22", "sun"], // the long total eclipse, seen from Varanasi and Patna
    ["2010-01-15", "sun"], // annular, southern India
    ["2019-12-26", "sun"], // annular, southern India
    ["2020-06-21", "sun"], // annular, northern India
    ["2018-07-28", "moon"], // the century's longest total lunar eclipse, after midnight on the 27th
    ["2022-11-08", "moon"], // total lunar eclipse at moonrise
    ["2025-09-07", "moon"], // total lunar eclipse, whole of India
  ] as const)("finds the %s eclipse of the %s and the tithi it requires", (date, body) => {
    const day = getPanchangForDate(date, delhi);
    const eclipse = day.eclipses.find((item) => item.body === body);
    expect(eclipse, "eclipse missing").toBeDefined();
    expect(eclipse!.visible).toBe(true);
    // At the eclipse itself the tithi is the last sliver of Amavasya/Purnima or the first of the
    // next, so the sunrise tithi of that day is one of the two neighbours.
    const allowed = body === "sun" ? [29, 30, 1] : [14, 15, 16];
    expect(allowed).toContain(day.tithi.number);
  });

  it("shows no eclipse on an ordinary day", () => {
    expect(getPanchangForDate("2026-11-16", delhi).eclipses).toEqual([]);
  });

  it.each([
    // Festival days as gazetted in India's public-holiday lists; each is defined by a tithi.
    { date: "2023-11-12", tithis: [29, 30], festival: "Diwali 2023 (Amavasya in the evening)" },
    { date: "2024-08-26", tithis: [22, 23], festival: "Janmashtami 2024 (Krishna Ashtami)" },
    { date: "2025-10-20", tithis: [29, 30], festival: "Diwali 2025 (Amavasya in the evening)" },
    { date: "2026-03-04", tithis: [15, 16], festival: "Holi 2026 (the day after Phalguna Purnima)" },
    { date: "2026-11-08", tithis: [29, 30], festival: "Diwali 2026 (Amavasya in the evening)" },
  ])("agrees with the gazetted date of $festival", ({ date, tithis }) => {
    expect(tithis).toContain(getPanchangForDate(date, delhi).tithi.number);
  });
});

/**
 * The whole century against NASA's published eclipse tables: 449 eclipses, each of which pins the
 * Sun-Moon angle (and so the tithi) at a known minute.
 */
describe("agreement with NASA's eclipse tables, 1951 to 2050", () => {
  function parse(table: string) {
    return table.trim().split("\n").map((line) => {
      const [date, time, type] = line.split(",");
      const [hours, minutes, seconds] = time.split(":").map(Number);
      // NASA prints Terrestrial Dynamical Time; it runs 29 to about 90 seconds ahead of clock time
      // over this century, which the two-minute tolerance below absorbs.
      return { date, type, at: Date.parse(`${date}T00:00:00Z`) + (hours * 3600 + minutes * 60 + seconds) * 1000 };
    });
  }
  const years = Array.from({ length: 100 }, (_, index) => 1951 + index);
  const toleranceMs = 2 * 60_000;

  it("finds every solar eclipse NASA lists, at the same minute, and nothing extra", () => {
    const nasa = parse(NASA_SOLAR_ECLIPSES);
    const ours = years.flatMap((year) => solarEclipses(year)).map((eclipse) => Date.parse(eclipse.peak));
    expect(nasa).toHaveLength(221);
    expect(ours).toHaveLength(nasa.length);
    nasa.forEach((row, index) => {
      expect(Math.abs(ours[index] - row.at), row.date).toBeLessThan(toleranceMs);
      // New moon: the Sun-Moon angle is within a degree of zero, the Amavasya/Pratipada line.
      const angle = elongation(new Date(ours[index]));
      expect(Math.min(angle, 360 - angle), row.date).toBeLessThan(1);
    });
  }, 60_000);

  it("finds every lunar eclipse NASA lists, at the same minute and of the same type", () => {
    const nasa = parse(NASA_LUNAR_ECLIPSES);
    const ours = years.flatMap((year) => lunarEclipses(year));
    const kinds: Record<string, string> = { N: "penumbral", P: "partial", T: "total" };
    expect(nasa).toHaveLength(228);
    expect(ours).toHaveLength(nasa.length);
    const typeDiffers: string[] = [];
    nasa.forEach((row, index) => {
      expect(Math.abs(Date.parse(ours[index].peak) - row.at), row.date).toBeLessThan(toleranceMs);
      if (ours[index].kind !== kinds[row.type]) typeDiffers.push(row.date);
      // Full moon: the angle is within a degree of 180, the Purnima/Pratipada line.
      expect(Math.abs(elongation(new Date(ours[index].peak)) - 180), row.date).toBeLessThan(1);
    });
    // Two grazing cases: the Moon misses the dark shadow by a hair in NASA's model of the shadow's
    // size and clips it in the other, so NASA says penumbral where this engine says partial. Same
    // instant, a different label; nothing else differs in 228 eclipses.
    expect(typeDiffers).toEqual(["1988-03-03", "2042-09-29"]);
  }, 60_000);
});
