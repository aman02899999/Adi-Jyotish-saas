/** Type companion for migrate-storage-to-supabase.mjs. The repo sets
 * allowJs: false, so a .mjs cannot be imported from a .ts test without this.
 * Hand-written; keep in sync with the .mjs exports. */

export function normalizeStoragePath(path: string): string;
export function storageObjectUrl(projectUrl: string, bucket: string, path: string): string;
export function parseArgs(argv: string[]): {
  dryRun: boolean;
  verify: boolean;
  only: string | null;
  bucket: string | null;
};
