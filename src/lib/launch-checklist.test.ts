import { describe, expect, it } from "vitest";
import { buildChecklist } from "@/lib/launch-checklist";

describe("buildChecklist", () => {
  const none = { razorpay: false, webhook: false, gemini: false, email: false, services: 0, online: 0 };

  it("lists every launch blocker with a fix while nothing is set", () => {
    const items = buildChecklist(none);
    expect(items.map((item) => item.key)).toEqual(["razorpay", "webhook", "gemini", "email", "services", "online"]);
    expect(items.every((item) => !item.done && item.fix.length > 0)).toBe(true);
  });

  it("marks each item done from its own setting only", () => {
    const items = buildChecklist({ ...none, webhook: true, services: 3 });
    expect(items.filter((item) => item.done).map((item) => item.key)).toEqual(["webhook", "services"]);
  });
});
