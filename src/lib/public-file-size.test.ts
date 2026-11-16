import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A big file in public/ can be copied into server functions and fail a deploy on the host's size
// limit, and it is paid for on every download. The four hero videos below already exist; anything
// new of 1 MB or more fails here until it is made smaller or added on purpose.
const ROOT = path.resolve(__dirname, "../..");
const BIG = 1_000_000;
const KNOWN = ["public/videos/homepage-hero.mp4", "public/videos/homepage-hero.webm", "public/videos/horoscope-hero.mp4", "public/videos/horoscope-hero.webm"];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

describe("public file size guard", () => {
  it("adds no new public file of 1 MB or more", () => {
    const big = walk(path.join(ROOT, "public"))
      .filter((f) => statSync(f).size >= BIG)
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
    expect(big.filter((f) => !KNOWN.includes(f))).toEqual([]);
  });
});
