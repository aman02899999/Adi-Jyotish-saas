/**
 * Code that still uses Firestore without consulting the cutover flag, checked by
 * cutover-coverage.test.ts. Every entry must be ported, or given a reason it should stay, before
 * SUPABASE_CUTOVER is switched on (docs/supabase-migration.md, phase 4). Remove an entry when you
 * port it; the test fails until you do.
 */
const NOT_YET_PORTED = "Not yet ported.";

export const FIRESTORE_ONLY: Record<string, string> = {
  "src/lib/gemstones-seed.ts#seedGemstoneCatalog": "By design: seeds the Firestore demo catalogue; every caller in gemstones.ts calls it only on the Firestore path, since under cutover the catalogue was copied.",
  "src/lib/scheduling.ts#seedPractitioners": "By design: seeds the Firestore roster; getPractitionerDirectory returns before calling it under cutover, where the roster was copied.",
};
