/** Type companion for remap-auth-uids.mjs. The repo sets allowJs: false, so a .mjs cannot be
 * imported from a .ts test without this. Hand-written; keep in sync with the .mjs exports. */

export function reverseRemapSql(sql: string): string;
export function pgSslOptions(env?: Record<string, string | undefined>): { ca?: string; rejectUnauthorized: boolean } | undefined;
export function runRemap(
  client: { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> },
  options?: { reverse?: boolean; log?: (line: string) => void },
): Promise<"skipped" | "reversed" | "remapped">;
