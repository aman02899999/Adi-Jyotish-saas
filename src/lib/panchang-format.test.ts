import { describe, expect, it } from "vitest";
import { getPanchangCity } from "@/lib/panchang-archive";
import { formatClock, formatClockOnDay, formatLongDate, formatMonthLabel, isIndexablePanchangPage, monthPathOf, panchangPath, weekdayIndex } from "@/lib/panchang-format";

const delhi = getPanchangCity("new-delhi")!;
const mumbai = getPanchangCity("mumbai")!;

describe("Panchang display helpers", () => {
  it("shows clock times in Indian time", () => {
    expect(formatClock("2026-11-16T01:14:19.664Z", "Asia/Kolkata")).toMatch(/^6:44\sam$/i);
    expect(formatClock(null, "Asia/Kolkata")).toBe("—");
  });

  it("names the day when a limb ends after midnight", () => {
    // 22:50 UTC on the 16th is 4:20 am on the 17th in India.
    expect(formatClockOnDay("2026-11-16T22:50:46.774Z", "2026-11-16", "Asia/Kolkata")).toMatch(/^4:20\sam, 17 Nov$/i);
    expect(formatClockOnDay("2026-11-16T09:44:49.410Z", "2026-11-16", "Asia/Kolkata")).toMatch(/^3:14\spm$/i);
  });

  it("writes dates and months out in full", () => {
    expect(formatLongDate("1950-01-26")).toBe("26 January 1950");
    expect(formatMonthLabel(2026, 11)).toBe("November 2026");
    expect(weekdayIndex("2026-11-16")).toBe(1);
  });

  it("gives the default city the short address and other cities their own", () => {
    expect(panchangPath("2026-11-16")).toBe("/panchang/2026-11-16");
    expect(panchangPath("2026-11-16", delhi)).toBe("/panchang/2026-11-16");
    expect(panchangPath("2026-11", mumbai)).toBe("/panchang/2026-11/mumbai");
    expect(monthPathOf("2026-11-16", mumbai)).toBe("/panchang/2026-11/mumbai");
  });

  it("invites search engines only to the default city's pages around the current year", () => {
    expect(isIndexablePanchangPage(2026, delhi, 2026)).toBe(true);
    expect(isIndexablePanchangPage(2027, delhi, 2026)).toBe(true);
    expect(isIndexablePanchangPage(2025, delhi, 2026)).toBe(true);
    expect(isIndexablePanchangPage(1990, delhi, 2026)).toBe(false);
    expect(isIndexablePanchangPage(2026, mumbai, 2026)).toBe(false);
  });
});
