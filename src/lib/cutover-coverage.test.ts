import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { FIRESTORE_ONLY } from "@/lib/cutover-coverage.allowlist";

/**
 * Every place that still reads or writes Firestore without consulting the cutover flag.
 *
 * Flipping SUPABASE_CUTOVER moves traffic to Postgres; anything listed here would keep using
 * Firestore — writing where nothing reads, or reading what nothing writes — and nothing would
 * error. docs/supabase-migration.md says "most read/write sites are not ported yet"; this makes
 * "which ones" a fact CI checks instead of a sentence that goes stale.
 *
 * Two ways to fail, both on purpose:
 * - new Firestore-only code that is not on the list — port it, or list it and say why;
 * - a listed site that no longer turns up — it was ported, so take it off.
 * The list can only shrink.
 *
 * Detection is textual. Routes and pages count as a whole file; library code counts per exported
 * function, because a module that routes one function says nothing about its neighbours
 * (marketplace.ts routed its directory reads long before its favourites and review-form reads).
 */

const ROOT = join(__dirname, "..", "..");
const FIRESTORE_CALL = /\bdb\.(collection|runTransaction|batch|getAll|collectionGroup|recursiveDelete)\b/;
const ROUTED = /isSupabaseCutoverActive/;

function walk(dir: string, accept: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, accept);
    return accept(path) ? [path] : [];
  });
}

/** The balanced-brace body starting at the first "{" at or after `from`. */
function bodyFrom(source: string, from: number): string {
  const start = source.indexOf("{", from);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** The body of an exported function, skipping its parameter list and any `{…}` in its return type. */
function functionBody(source: string, afterName: number): string {
  let depth = 0;
  let i = source.indexOf("(", afterName);
  for (; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")" && --depth === 0) break;
  }
  // A return type like Promise<{ a: string }> opens a brace before the body; skip while angle
  // brackets are unbalanced.
  let open = source.indexOf("{", i);
  while (open !== -1) {
    const between = source.slice(i, open);
    if ((between.match(/</g) ?? []).length === (between.match(/>/g) ?? []).length) break;
    open = source.indexOf("{", open + 1);
  }
  return bodyFrom(source, open);
}

function firestoreOnlySites(): string[] {
  const sites: string[] = [];

  for (const path of walk(join(ROOT, "src", "app"), (p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p))) {
    const source = readFileSync(path, "utf8");
    if (FIRESTORE_CALL.test(source) && !ROUTED.test(source)) sites.push(relative(ROOT, path));
  }

  for (const path of walk(join(ROOT, "src", "lib"), (p) => p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.includes("-supabase"))) {
    const source = readFileSync(path, "utf8");
    if (!FIRESTORE_CALL.test(source)) continue;
    for (const match of source.matchAll(/export (?:async )?function (\w+)/g)) {
      const body = functionBody(source, match.index! + match[0].length);
      if (FIRESTORE_CALL.test(body) && !ROUTED.test(body)) sites.push(`${relative(ROOT, path)}#${match[1]}`);
    }
  }
  return sites.sort();
}

describe("cutover coverage", () => {
  const found = firestoreOnlySites();
  const listed = Object.keys(FIRESTORE_ONLY).sort();

  it("has no new Firestore-only code", () => {
    expect(found.filter((site) => !(site in FIRESTORE_ONLY))).toEqual([]);
  });

  it("lists nothing that has since been ported", () => {
    expect(listed.filter((site) => !found.includes(site))).toEqual([]);
  });

  it("finds the sites it is meant to find", () => {
    // A detector that silently stopped matching would pass both tests above with an empty list.
    expect(found.length).toBeGreaterThan(10);
    expect(found).toContain("src/lib/scheduling.ts#seedPractitioners");
  });
});
