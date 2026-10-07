// Run after `next build`. Every server function that loads @swisseph/node must ship its compiled
// addon and ephemeris data, or chart calculations fail in production with "No native build was
// found". Tracing cannot see those files (they are loaded through computed paths), so next.config.ts
// lists them under outputFileTracingIncludes. This fails the build if any function is missing them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The addon may be the prebuilt one or one compiled on the build machine (scripts/build-native.mjs).
const ADDONS = ["@swisseph/node/build/Release/swisseph.node", "@swisseph/node/prebuilds/linux-x64/swisseph.node"];
const EPHEMERIS = "@swisseph/node/ephemeris/sepl_18.se1";

function* traces(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* traces(path);
    else if (entry.endsWith(".nft.json")) yield path;
  }
}

let checked = 0;
const missing = [];
for (const trace of traces(".next/server/app")) {
  const files = JSON.parse(readFileSync(trace, "utf8")).files;
  if (!files.some((file) => file.includes("@swisseph/node/dist/index.js"))) continue;
  checked += 1;
  const absent = [];
  if (!ADDONS.some((addon) => files.some((file) => file.endsWith(addon)))) absent.push("the swisseph.node addon");
  if (!files.some((file) => file.endsWith(EPHEMERIS))) absent.push(EPHEMERIS);
  if (absent.length) missing.push(`${trace}: ${absent.join(", ")}`);
}

if (checked === 0) {
  console.error("No server function loads @swisseph/node: the check found nothing to verify. Has the build run?");
  process.exit(1);
}
if (missing.length) {
  console.error(`${missing.length} of ${checked} functions that load @swisseph/node would ship without its native files:\n${missing.join("\n")}`);
  process.exit(1);
}
console.log(`All ${checked} functions that load @swisseph/node ship its addon and ephemeris data.`);
