/** Type companion for supabase-cutover-report.mjs. The repo sets allowJs: false, so a .mjs cannot
 * be imported from a .ts test without this. Hand-written; keep in sync with the .mjs exports. */

export declare const EXPECTED_TABLES: number;

export interface CutoverFacts {
  tableCount: number;
  rlsOff: string[];
  exposed: string[];
  rolesChecked: string[];
  counts: Array<{ table: string; rows: number }>;
  totalRows: number;
  authUsers: number;
  signedIn: number;
  buckets: Array<{ id: string; public: boolean }>;
  objects: number;
  mapped: number;
  membersStillOnFirebaseId: number;
  membersWithoutLogin: number;
  walletEntriesMissingBalance: number;
}

export interface CutoverVerdict {
  ok: boolean;
  checks: Array<{ ok: boolean; label: string; detail: string; blocking: boolean }>;
}

export function collectFacts(client: {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}): Promise<CutoverFacts>;
export function evaluate(
  facts: CutoverFacts,
  options?: { guardCopy?: boolean; afterCopy?: boolean; allowAfterSignins?: boolean; bucket?: string },
): CutoverVerdict;
export function renderMarkdown(facts: CutoverFacts, verdict: CutoverVerdict, title: string): string;
export function connectionHint(connectionString: string, error: { code?: string; message?: string } | null): string;
