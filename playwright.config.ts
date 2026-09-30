import { defineConfig, devices } from "@playwright/test";

/**
 * E2E env vars (FIRESTORE_EMULATOR_HOST etc.) are set by the CI workflow / local dev shell before
 * this config loads — not here — so the same webServer command works whether the emulator was
 * started by this config's own `webServer` entry or is already running.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: "chromium",
    // PLAYWRIGHT_CHROMIUM_PATH is an escape hatch for sandboxes that ship a pre-installed
    // Chromium at a nonstandard path instead of one `npx playwright install` manages — unset
    // everywhere else (CI, real dev machines), where Playwright resolves its own browser build.
    use: { ...devices["Desktop Chrome"], launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {} },
  }],
  webServer: [
    {
      command: "node_modules/.bin/firebase emulators:start --project=demo-jyotish --only auth,firestore,storage",
      url: "http://127.0.0.1:8080",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      env: {
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        GCLOUD_PROJECT: "demo-jyotish",
        GOOGLE_CLOUD_PROJECT: "demo-jyotish",
        NEXT_PUBLIC_USE_EMULATOR: "true",
        NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-jyotish.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-jyotish",
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-jyotish.appspot.com",
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
        NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:abcdef",
        // Palm and face readings keep their photos in Storage; the emulator stands in for the bucket.
        FIREBASE_STORAGE_BUCKET: "demo-jyotish.appspot.com",
        FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
        STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
        // The AI astrologers and readings run against e2e/support/mock-gemini.mjs, which answers
        // in-process: no request reaches Google, so the key below is never valid anywhere.
        GEMINI_API_KEY: "e2e-stub-key",
        NODE_OPTIONS: "--import ./e2e/support/mock-gemini.mjs",
      },
    },
  ],
  globalSetup: "./e2e/global-setup.ts",
});
