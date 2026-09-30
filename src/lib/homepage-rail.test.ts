import { describe, expect, it } from "vitest";
import { buildRailItems } from "@/lib/homepage-rail";

/** The rail may only say true things: no "online" line with nobody online, no rating without reviews. */
const base = { onlineCount: 0, averageRating: 0, reviewCount: 0, abhijit: null, moonNakshatra: null, refereeReward: 100, referrerReward: 150, giftFrom: 500 };

describe("buildRailItems", () => {
  it("leads with the free chart and always offers the invite and gift", () => {
    const items = buildRailItems(base);
    expect(items[0].href).toBe("/#free-chart");
    expect(items.map((item) => item.icon)).toEqual(["chart", "invite", "gift"]);
    expect(items[1].text).toContain("they get ₹100 and you get ₹150");
  });

  it("claims nobody is online only when someone is", () => {
    expect(buildRailItems({ ...base, onlineCount: 1 }).find((item) => item.icon === "chat")?.text).toBe("1 astrologer is online right now");
    expect(buildRailItems({ ...base, onlineCount: 4 }).find((item) => item.icon === "chat")?.text).toBe("4 astrologers are online right now");
  });

  it("shows a rating only with at least five genuine reviews", () => {
    expect(buildRailItems({ ...base, averageRating: 5, reviewCount: 2 }).some((item) => item.icon === "rating")).toBe(false);
    expect(buildRailItems({ ...base, averageRating: 4.76, reviewCount: 12 }).find((item) => item.icon === "rating")?.text).toBe("Rated 4.8 out of 5 in 12 verified reviews");
  });

  it("gives today's Abhijit Muhurat in Indian time", () => {
    const items = buildRailItems({ ...base, abhijit: { start: "2026-09-29T06:23:07Z", end: "2026-09-29T07:10:56Z" }, moonNakshatra: "Ashwini" });
    expect(items.find((item) => item.icon === "muhurat")?.text).toMatch(/11:53\s?am to 12:40\s?pm/i);
    expect(items.find((item) => item.icon === "moon")?.text).toBe("The Moon is in Ashwini today");
  });
});
