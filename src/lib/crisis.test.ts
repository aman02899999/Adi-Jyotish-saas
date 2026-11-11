import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CRISIS_HELPLINES, crisisSupportMessage, detectCrisis } from "@/lib/crisis";

describe("crisis word detection", () => {
  it.each([
    "I want to kill myself",
    "i dont want to live anymore, when will it get better?",
    "Thinking about suicide since my job loss",
    "I feel like ending my life",
    "I keep cutting myself",
    "main marna chahta hoon",
    "mujhe jeena nahi hai ab",
    "khudkushi karne ka mann hai",
    "मैं आत्महत्या करना चाहती हूँ",
    "अब जीना नहीं चाहता",
  ])("flags self-harm: %s", (text) => {
    expect(detectCrisis(text)).toBe("self_harm");
  });

  it.each([
    "My husband beats me every night, will it stop?",
    "I am being abused by my in-laws",
    "there is domestic violence at home",
    "mera pati mujhe maarta hai",
    "मेरा पति मुझे मारता है",
    "I was sexually assaulted",
  ])("flags abuse: %s", (text) => {
    expect(detectCrisis(text)).toBe("abuse");
  });

  it.each([
    "When will I get married?",
    "Will my career improve after Saturn's transit?",
    "I'm dying to know if I get the visa",
    "My boss killed my promotion chances",
    "Is the dasha of Rahu harmful for me?",
    "mera vivah kab hoga",
    "मेरी शादी कब होगी",
    "",
  ])("leaves ordinary questions alone: %s", (text) => {
    expect(detectCrisis(text)).toBeNull();
  });
});

describe("crisis support message", () => {
  it("names the helplines and never offers a reading", () => {
    for (const kind of ["self_harm", "abuse"] as const) {
      const message = crisisSupportMessage(kind);
      expect(message).toContain("14416");
      expect(message).toContain("112");
      expect(message).not.toMatch(/dosha|remedy|upay|gemstone|chart says/i);
    }
    expect(crisisSupportMessage("abuse")).toContain("181");
  });

  it("lists each helpline with a number and who runs it", () => {
    expect(CRISIS_HELPLINES.length).toBeGreaterThanOrEqual(3);
    for (const line of CRISIS_HELPLINES) {
      expect(line.number).toMatch(/^\d{3,5}$/);
      expect(line.name.length).toBeGreaterThan(3);
    }
  });
});

// Every surface where a customer's own words reach the AI must check them first, before any
// reading is created or charged for.
describe("crisis check is wired into every AI text surface", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it.each([
    "src/app/api/ai-readings/route.ts",
    "src/app/api/ai-readings/tarot/route.ts",
    "src/app/api/ai-readings/face/route.ts",
    "src/app/api/ai-readings/vastu/route.ts",
    "src/app/api/ai-readings/lal-kitab/route.ts",
    "src/app/api/ai-readings/persona/[slug]/route.ts",
  ])("%s stops before creating a reading", (path) => {
    const source = read(path);
    const guard = source.indexOf("crisisResponse(");
    const create = source.search(/createPending\w*Reading\(|createFreeReading\(/);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(create);
  });

  it("the chat checks a member's message before asking the AI to reply", () => {
    const source = read("src/lib/chat.ts");
    const guard = source.indexOf("detectCrisis(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf("await getPractitionerChatReply("));
  });

  it("the admin alert never carries the customer's words", () => {
    const source = read("src/lib/crisis-response.ts");
    expect(source).not.toMatch(/body:\s*`[^`]*\$\{(text|question|message)/);
  });
});
