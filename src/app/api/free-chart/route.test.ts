import { describe, expect, it } from "vitest";
import { POST } from "./route";

/** The public free-chart endpoint: anyone can call it, so every bad input must be a clear 400. */
let ip = 0;
const post = (body: unknown) => POST(new Request("http://localhost/api/free-chart", {
  method: "POST",
  // A fresh address per call keeps the per-IP limit out of these tests.
  headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${++ip}` },
  body: JSON.stringify(body),
}));
const valid = { birthDate: "1994-06-15", birthTime: "07:45", birthPlace: "Jaipur, India" };

describe("POST /api/free-chart", () => {
  it("returns the chart preview for valid birth details", async () => {
    const response = await post(valid);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ timeKnown: true, ascendant: { name: "Mithuna" }, moon: { nakshatras: ["Magha"] } });
  });

  it.each([
    ["a missing date", { birthDate: "" }],
    ["an impossible date", { birthDate: "1994-13-45" }],
    ["a future date", { birthDate: "2999-01-01" }],
    ["a date before 1900", { birthDate: "1850-01-01" }],
    ["a missing time", { birthTime: "" }],
    ["a malformed time", { birthTime: "25:99" }],
    ["a missing place", { birthPlace: "" }],
    ["a date sent as a number", { birthDate: 19940615 }],
  ])("rejects %s", async (_label, change) => {
    expect((await post({ ...valid, ...change })).status).toBe(400);
  });

  it("accepts an unknown birth time without a time, and answers without guessing one", async () => {
    const response = await post({ ...valid, birthTime: "", timeUnknown: true });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ timeKnown: false, ascendant: null, moon: { pada: null } });
  });

  it("explains a place it cannot find instead of failing", async () => {
    const response = await post({ ...valid, birthPlace: "Qwzxplace Nowhere" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("limits how often one visitor can call it", async () => {
    const same = () => POST(new Request("http://localhost/api/free-chart", { method: "POST", headers: { "x-forwarded-for": "10.9.9.9" }, body: JSON.stringify(valid) }));
    const statuses: number[] = [];
    for (let call = 0; call < 21; call += 1) statuses.push((await same()).status);
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
