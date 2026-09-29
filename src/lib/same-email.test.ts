import { describe, expect, it } from "vitest";

import { sameEmail } from "@/lib/same-email";

describe("sameEmail", () => {
  it("matches an address regardless of case and surrounding spaces", () => {
    expect(sameEmail("Asha@Example.com", "asha@example.com")).toBe(true);
    expect(sameEmail(" asha@example.com ", "ASHA@EXAMPLE.COM")).toBe(true);
  });

  it("never matches different or missing addresses", () => {
    expect(sameEmail("asha@example.com", "asha@example.org")).toBe(false);
    expect(sameEmail("", "")).toBe(false);
    expect(sameEmail(null, "asha@example.com")).toBe(false);
    expect(sameEmail(undefined, undefined)).toBe(false);
  });
});
