#!/usr/bin/env node
// Regenerates src/lib/geo-data/cities.json from the `all-the-cities` package (GeoNames-derived).
//
// geo.ts can't read `all-the-cities`'s bundled cities.pbf via fs at runtime — Next.js's production
// output tracing doesn't follow the package's own `path.join(__dirname, 'cities.pbf')` read, so the
// file is missing from the deployed bundle and the app crashes on first use. Baking a plain JSON
// array into the repo sidesteps that entirely (any bundler handles a JSON import natively) and lets
// us trim the dataset to what this app actually needs: every Indian settlement regardless of size
// (India is this product's core audience — small towns like Noida matter here) plus a population
// floor for the rest of the world (kept only broad enough for diaspora/foreign-practitioner birth
// places, not exhaustive).
//
// Re-run with `node scripts/generate-geo-cities.mjs` after bumping the `all-the-cities` devDependency
// to pick up a newer GeoNames snapshot.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import allTheCities from "all-the-cities";

const WORLD_POPULATION_FLOOR = 15000;

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "geo-data", "cities.json");

const india = allTheCities.filter((city) => city.country === "IN");
const world = allTheCities.filter((city) => city.country !== "IN" && (city.population ?? 0) >= WORLD_POPULATION_FLOOR);

// Compact tuple rows (not objects) to keep the checked-in JSON small: [name, altName, countryCode,
// adminCode, population, lat*1e5, lon*1e5] — see loadCities() in src/lib/geo.ts for the reader.
const rows = [...india, ...world].map((city) => [
  city.name,
  city.altName || "",
  city.country,
  city.adminCode || "",
  city.population || 0,
  Math.round(city.loc.coordinates[1] * 1e5),
  Math.round(city.loc.coordinates[0] * 1e5),
]);

writeFileSync(outPath, JSON.stringify(rows));
console.log(`Wrote ${rows.length} cities (${india.length} India, ${world.length} world, pop >= ${WORLD_POPULATION_FLOOR}) to ${outPath}`);
