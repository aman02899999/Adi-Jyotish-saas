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

    // Module-level handles (`const reviewsCol = db.collection("gemstoneReviews")`) are created once,
    // outside any function, so a function using `reviewsCol.doc(id)` contains no `db.` call at all.
    // Without this, every function in such a module was invisible to the guard.
    const handles = [...source.matchAll(/^(?:export )?const (\w+) = db\.(?:collection|collectionGroup)\b/gm)].map((match) => match[1]);
    const usesHandle = handles.length ? new RegExp(`\\b(?:${handles.join("|")})\\.`) : null;

    // Every function in the file, exported or not, so a Firestore call reached through a local
    // helper (`familyCollection(id).get()`) counts the same as one made directly.
    const functions = new Map<string, { exported: boolean; body: string }>();
    for (const match of source.matchAll(/(export )?(?:async )?function (\w+)/g)) {
      functions.set(match[2], { exported: Boolean(match[1]), body: functionBody(source, match.index! + match[0].length) });
    }
    for (const match of source.matchAll(/(export )?const (\w+) = (?:async )?\([^)]*\)\s*(?::[^=]+)?=>/g)) {
      const start = match.index! + match[0].length;
      const body = source[source.slice(start).search(/\S/) + start] === "{" ? bodyFrom(source, start) : source.slice(start, source.indexOf("\n", start));
      functions.set(match[2], { exported: Boolean(match[1]), body });
    }

    // `export const getPromoBanner = unstable_cache(fetchPromoBanner, …)` (or an inline arrow) is an
    // exported function too; its body is what it wraps, with a bare reference read as a call.
    for (const match of source.matchAll(/(export )?const (\w+) = (?:unstable_cache|cache)\(/g)) {
      const open = match.index! + match[0].length - 1;
      let depth = 0;
      let end = open;
      for (; end < source.length; end += 1) {
        if (source[end] === "(") depth += 1;
        else if (source[end] === ")" && --depth === 0) break;
      }
      const wrapped = source.slice(open + 1, end).replace(/^\s*(\w+)\s*,/, "$1(),");
      functions.set(match[2], { exported: Boolean(match[1]), body: wrapped });
    }

    // A function touches Firestore if it calls it, or calls a local function that does — unless it
    // consults the cutover flag itself, in which case it has chosen its provider.
    const touches = new Set<string>();
    for (let changed = true; changed;) {
      changed = false;
      for (const [name, fn] of functions) {
        if (touches.has(name) || ROUTED.test(fn.body)) continue;
        const direct = FIRESTORE_CALL.test(fn.body) || Boolean(usesHandle?.test(fn.body));
        const viaHelper = [...touches].some((helper) => helper !== name && new RegExp(`\\b${helper}\\(`).test(fn.body));
        if (direct || viaHelper) {
          touches.add(name);
          changed = true;
        }
      }
    }
    for (const name of touches) {
      if (functions.get(name)!.exported) sites.push(`${relative(ROOT, path)}#${name}`);
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
    // The seed stays on Firestore by design, so it is always there to find.
    expect(found).toContain("src/lib/scheduling.ts#seedPractitioners");
  });
});
