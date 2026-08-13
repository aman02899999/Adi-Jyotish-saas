/** Lighthouse CI config. Runs against a production build served locally with the Firebase
 * emulator standing in for Firestore/Auth (see .github/workflows/ci.yml's `lighthouse` job and
 * scripts/lighthouse-ci.sh — server startup/teardown lives there, not here, since it also has to
 * wait on the emulator).
 *
 * Assertions are "warn" rather than "error": there's no historical baseline yet to set real
 * pass/fail budgets against, so this starts as a visible, non-blocking signal. Tighten these once
 * a few runs establish what the actual numbers look like. */
module.exports = {
  ci: {
    collect: {
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/gemstones",
        "http://localhost:3000/astrologers",
        "http://localhost:3000/pricing",
      ],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        skipAudits: ["uses-http2"],
        // CI runners (and this GitHub Actions job in particular) launch Chrome as root, which
        // Chrome refuses to do under its normal sandbox — without this flag the run hangs
        // waiting for a Chrome process that never comes up.
        chromeFlags: "--no-sandbox --disable-gpu",
      },
    },
    assert: {
      preset: "lighthouse:no-pwa",
      assertions: {
        "categories:performance": ["warn", { minScore: 0.5 }],
        "categories:accessibility": ["warn", { minScore: 0.8 }],
        "categories:best-practices": ["warn", { minScore: 0.8 }],
        "categories:seo": ["warn", { minScore: 0.8 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
