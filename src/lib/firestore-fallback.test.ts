import { describe, expect, it, vi } from "vitest";
import { withFirebaseFallback } from "@/lib/firestore";

/**
 * Public pages read optional sections through withFirebaseFallback. A spent Firestore quota used to
 * be re-thrown, which took the whole homepage and the sitemap down with a 500 in production.
 */
const grpcError = (code: number, message: string) => Object.assign(new Error(`${code} ${message}`), { code });

describe("withFirebaseFallback", () => {
  it.each([
    ["a spent daily quota", grpcError(8, "RESOURCE_EXHAUSTED: Quota exceeded.")],
    ["a timed-out request", grpcError(4, "DEADLINE_EXCEEDED: Deadline exceeded")],
    ["an unreachable backend", grpcError(14, "UNAVAILABLE: No connection established")],
  ])("falls back on %s instead of failing the page", async (_label, error) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(withFirebaseFallback(async () => { throw error; }, "fallback", "test")).resolves.toBe("fallback");
    warn.mockRestore();
  });

  it("still throws a genuine bug, so it is not hidden", async () => {
    await expect(withFirebaseFallback(async () => { throw new TypeError("x is not a function"); }, "fallback", "test")).rejects.toThrow(TypeError);
  });
});
