// Runs before `next build`. @swisseph/node ships a prebuilt addon compiled against GLIBC 2.38, but
// Vercel's build and runtime machines have an older GLIBC, so in production every chart calculation
// failed with "GLIBC_2.38 not found". The package's own install step (node-gyp rebuild) never runs
// there: npm skips unapproved install scripts and Vercel restores node_modules from its cache.
//
// So this compiles the addon from the C sources the package ships, on the build machine itself,
// whenever the prebuilt one cannot be loaded there. node-gyp-build prefers build/Release over
// prebuilds/, and next.config.ts traces build/Release into every function. Where the prebuilt addon
// loads (a newer GLIBC, as on CI and most dev machines) nothing is compiled.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const packageDir = join(dirname(require.resolve("node-addon-api/package.json")), "..", "@swisseph", "node");
const compiled = join(packageDir, "build", "Release", "swisseph.node");
const prebuilt = join(packageDir, "prebuilds", `${process.platform}-${process.arch}`, "swisseph.node");

/** Loads the addon in a separate process, so a failed dlopen is reported rather than fatal. */
function loads(file) {
  if (!existsSync(file)) return false;
  const result = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(file)})`], { encoding: "utf8" });
  if (result.status !== 0) console.log(`  cannot load ${file}:\n  ${result.stderr.trim().split("\n").find((line) => line.includes("Error")) ?? result.stderr.trim()}`);
  return result.status === 0;
}

if (loads(compiled)) {
  console.log("@swisseph/node: using the addon compiled on this machine.");
} else if (!process.env.FORCE_SWISSEPH_BUILD && loads(prebuilt)) {
  console.log("@swisseph/node: the prebuilt addon loads here; nothing to compile.");
} else {
  console.log("@swisseph/node: compiling the addon from source for this machine...");
  execFileSync(process.execPath, [require.resolve("node-gyp/bin/node-gyp.js"), "rebuild"], { cwd: packageDir, stdio: "inherit" });
  if (!loads(compiled)) {
    console.error("@swisseph/node: the compiled addon still does not load. Chart calculations would fail in production.");
    process.exit(1);
  }
  console.log("@swisseph/node: compiled and verified.");
}
