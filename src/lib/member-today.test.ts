import { describe, expect, it } from "vitest";
import { buildMemberToday, runningDasha, windowStatus } from "@/lib/member-today";

/**
 * The dashboard used to print "10:42 – 11:28 AM" as everyone's Abhijit Muhurat, every day. These
 * pin the real values for Jaipur on 29 Sep 2026 (Abhijit 11:53 AM – 12:40 PM IST).
 */
const jaipur = { civilDate: "2026-09-29", latitude: 26.9124, longitude: 75.7873, timeZone: "Asia/Kolkata", placeLabel: "Jaipur" };

describe("buildMemberToday", () => {
  const today = buildMemberToday(jaipur);
  const ist = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

  it("computes the city's own Abhijit Muhurat instead of a fixed time", () => {
    expect(ist(today.abhijit!.start)).toMatch(/^11:53\s?am$/i);
    expect(ist(today.abhijit!.end)).toMatch(/^12:40\s?pm$/i);
  });

  it("names the tithi with its paksha, the weekday and the nakshatra", () => {
    expect(today.tithi).toBe("Krishna Tritiya");
    expect(today.vara).toBe("Mangalavara");
    expect(today.nakshatra.name).toBe("Ashwini");
    expect(today.rahuKala).not.toBeNull();
  });

  it("moves with the place: Mumbai's Abhijit is later than Jaipur's", () => {
    const mumbai = buildMemberToday({ ...jaipur, latitude: 19.076, longitude: 72.8777, placeLabel: "Mumbai" });
    expect(new Date(mumbai.abhijit!.start) > new Date(today.abhijit!.start)).toBe(true);
  });
});

describe("windowStatus", () => {
  const window = { start: "2026-09-29T06:23:00Z", end: "2026-09-29T07:10:00Z" };
  it("says whether the window is ahead, open or over", () => {
    expect(windowStatus(window, new Date("2026-09-29T05:00:00Z"))).toBe("upcoming");
    expect(windowStatus(window, new Date("2026-09-29T06:30:00Z"))).toBe("now");
    expect(windowStatus(window, new Date("2026-09-29T08:00:00Z"))).toBe("passed");
  });
});

describe("runningDasha", () => {
  it("finds the Mahadasha and the Antardasha inside it", () => {
    // A Moon at 0° Ashwini starts life in Ketu's 7-year Mahadasha.
    const dasha = runningDasha(0.0001, new Date("2000-01-01T00:00:00Z"), new Date("2001-06-01T00:00:00Z"));
    expect(dasha?.maha.lord).toBe("Ketu");
    expect(dasha?.antar?.lord).toBeTruthy();
    expect(new Date(dasha!.antar!.end) <= new Date(dasha!.maha.end)).toBe(true);
  });
});
