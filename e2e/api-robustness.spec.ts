import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * No API route may answer a malformed request with a 500. Every route under src/app/api is called,
 * signed in as the admin (the role that reaches furthest into each handler), with a body that is
 * not JSON and with an id Firestore cannot store. Either used to crash about 280 route/role pairs:
 * `request.json()` throwing on the body, `.trim()` on a non-string field, and Firestore throwing on
 * a reserved `__name__` id instead of returning "not found".
 */
test.use({ storageState: "e2e/.auth/admin.json" });

// Calls that would sign the test admin out or delete the fixtures the other specs rely on.
const SKIP = /logout|delete-account|\/auth\/setup|demo-accounts|2fa\/disable|sessions\/revoke/;

function apiRoutes() {
  const found: { route: string; methods: string[] }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") {
        const source = fs.readFileSync(full, "utf8");
        const methods = [...source.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
        found.push({ route: path.dirname(full).slice("src/app".length).split(path.sep).join("/"), methods });
      }
    }
  };
  walk("src/app/api");
  return found.filter((entry) => !SKIP.test(entry.route));
}

test("no API route answers a malformed request with a 500", async ({ request }) => {
  test.setTimeout(180_000);
  const crashes: string[] = [];
  for (const { route, methods } of apiRoutes()) {
    const target = route.replace(/\[[^\]]+\]/g, "__x__");
    for (const method of methods) {
      const response = await request.fetch(target, {
        method,
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        data: method === "GET" || method === "DELETE" ? undefined : "not-json{",
        maxRedirects: 0,
      });
      if (response.status() >= 500 && response.status() !== 503) crashes.push(`${method} ${route} -> ${response.status()}`);
    }
  }
  expect(crashes).toEqual([]);
});
