import { describe, expect, it } from "vitest";
import { addGstExclusive, splitGstInclusive } from "@/lib/gst";

describe("splitGstInclusive", () => {
  it("splits a GST-inclusive total into subtotal and tax", () => {
    const { subtotal, taxAmount } = splitGstInclusive(1180, 18);
    expect(subtotal).toBe(1000);
    expect(taxAmount).toBe(180);
    expect(subtotal + taxAmount).toBe(1180);
  });

  it("returns zero tax when the rate is zero", () => {
    expect(splitGstInclusive(500, 0)).toEqual({ subtotal: 500, taxAmount: 0 });
  });

  it("rounds to whole currency units and never loses money off the total", () => {
    const { subtotal, taxAmount } = splitGstInclusive(999, 18);
    expect(subtotal + taxAmount).toBe(999);
  });
});

describe("addGstExclusive", () => {
  it("adds GST on top of a pre-tax amount", () => {
    expect(addGstExclusive(1000, 18)).toEqual({ subtotal: 1000, taxAmount: 180, total: 1180 });
  });

  it("is the inverse of splitGstInclusive for round amounts", () => {
    const inclusive = 1180;
    const { subtotal } = splitGstInclusive(inclusive, 18);
    const { total } = addGstExclusive(subtotal, 18);
    expect(total).toBe(inclusive);
  });
});
