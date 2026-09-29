import { describe, expect, it } from "vitest";

import { resolvePlaceToCoordinates, searchPlaces } from "@/lib/geo";

/**
 * Birth places feed every chart, match and reading. Each case here was a customer-facing failure:
 * the place was rejected with "we couldn't recognize", so the member could not get a chart at all.
 */
const resolved = (place: string) => resolvePlaceToCoordinates(place)?.matchedName ?? null;

describe("resolvePlaceToCoordinates", () => {
  it("finds towns the data spells with diacritics when typed plainly", () => {
    expect(resolved("Allahabad")).toBe("Allahābād, Uttar Pradesh, India");
    expect(resolved("Kanniyakumari, Tamil Nadu")).toBe("Kanniyākumāri, Tamil Nadu, India");
  });

  it("finds Delhi, Chandigarh and Puducherry, which are also state or union territory names", () => {
    expect(resolved("Delhi, India")).toBe("Delhi, Delhi, India");
    expect(resolved("Delhi")).toBe("Delhi, Delhi, India");
    expect(resolved("Chandigarh")).toBe("Chandigarh, Chandigarh, India");
    expect(resolved("Puducherry, India")).toBe("Puducherry, Puducherry, India");
  });

  it("maps former names, short forms and renames to the city the data knows", () => {
    expect(resolved("Bombay")).toBe("Mumbai, Maharashtra, India");
    expect(resolved("Madras")).toBe("Chennai, Tamil Nadu, India");
    expect(resolved("Bangalore, Karnataka")).toBe("Bengaluru, Karnataka, India");
    expect(resolved("Gurugram, Haryana")).toBe("Gurgaon, Haryana, India");
    expect(resolved("Prayagraj")).toBe("Allahābād, Uttar Pradesh, India");
    expect(resolved("Pondicherry")).toBe("Puducherry, Puducherry, India");
    expect(resolved("Vizag")).toBe("Visakhapatnam, Andhra Pradesh, India");
  });

  it("still refuses a bare state or country, rather than guessing a city", () => {
    expect(resolved("India")).toBeNull();
    expect(resolved("Goa, India")).toBeNull();
    expect(resolved("Kerala")).toBeNull();
  });

  it("narrows a US city by its full state name, which the data stores as a postal code", () => {
    expect(resolved("Springfield, Illinois")).toBe("Springfield, IL, United States");
  });

  it("keeps resolving ordinary input as before", () => {
    expect(resolved("Noida, Uttar Pradesh, India")).toBe("Noida, Uttar Pradesh, India");
    expect(resolvePlaceToCoordinates("Mumbai")?.timezone).toBe("Asia/Kolkata");
  });
});

describe("searchPlaces", () => {
  it("suggests diacritic-spelled towns and renamed cities from what people type", () => {
    expect(searchPlaces("allahabad", 3).map((place) => place.label)).toContain("Allahābād, Uttar Pradesh, India");
    expect(searchPlaces("bangalore", 3).map((place) => place.label)).toContain("Bengaluru, Karnataka, India");
  });
});
