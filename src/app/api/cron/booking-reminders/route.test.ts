import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reminder endpoint is reachable from the internet, so the only thing between a stranger and
 * a mail run is the shared secret.
 */

const runs = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/booking-reminders", () => ({
  sendDueBookingReminders: async () => {
    runs.count += 1;
    return { claimed: 0, emailed: 0, messaged: 0, failed: 0 };
  },
}));

const { GET } = await import("@/app/api/cron/booking-reminders/route");
const SECRET = "s3cret-value-long-enough";
const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/booking-reminders", { headers: authorization ? { authorization } : {} }));

describe("GET /api/cron/booking-reminders", () => {
  beforeEach(() => { runs.count = 0; });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("runs with the right bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(runs.count).toBe(1);
  });

  it("refuses a missing or wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${SECRET}x`)).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401);
    expect(runs.count).toBe(0);
  });

  it("stays closed when CRON_SECRET is unset or too short", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "short");
    expect((await call("Bearer short")).status).toBe(503);
    expect(runs.count).toBe(0);
  });
});
