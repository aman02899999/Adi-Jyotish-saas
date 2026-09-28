import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * API route ids go straight into Firestore document paths, and Firestore throws on ids it cannot
 * store. The proxy answers 404 for those before any route runs, so none of them can surface as a 500.
 */
vi.mock("next-intl/middleware", () => ({ default: () => () => new Response(null, { status: 200 }) }));
const { proxy } = await import("@/proxy");

const get = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));

describe("proxy: ids Firestore cannot address", () => {
  // ("%2E%2E" is not listed: the URL parser collapses it into the parent path before any code runs.)
  it("answers 404 for a reserved name, an encoded slash and a malformed escape", async () => {
    for (const path of ["/api/members/__x__", "/api/members/a%2Fb", "/api/members/%E0%A4"]) {
      const response = get(path);
      expect(response.status, path).toBe(404);
    }
  });

  it("lets ordinary ids through untouched", () => {
    for (const path of ["/api/members/abc123", "/api/bookings/JY-2609-A1B2C3", "/api/ai-readings/x_y-z"]) {
      expect(get(path).status, path).not.toBe(404);
    }
  });
});
