/**
 * Types for the Firestore → Supabase copy script.
 *
 * The script is plain ESM JavaScript so it can be run straight from the shell
 * with `node scripts/...` and no build step, which means tsconfig has
 * `allowJs: false` and would otherwise refuse to resolve it from a test. This
 * declaration is the contract the test imports against; if you change a
 * signature in the script, change it here too.
 */

export type TableSpec = {
  /** Firestore collection name. */
  collection: string;
  /** Target Postgres table. */
  table: string;
  /** Column that receives the parent document id, for flattened subcollections. */
  parent?: string;
  /** Synthesises a primary key when the doc id is not unique once flattened. */
  idFrom?: (parentId: string | null, docId: string) => string;
  /** Primary key column when it is not `id`. */
  pkColumn?: string;
  /** True when the document id itself is the primary key value. */
  pkFromDocId?: boolean;
  /** Extra column that keeps the original document id alongside a synthesised pk. */
  docIdColumn?: string;
  /** Firestore field name -> column name, for the fields whose column is not a
   * straight camelCase-to-snake_case transliteration. Applied before
   * camelToSnake, so a renamed field is never reported as unknown. */
  rename?: Record<string, string>;
  /** Firestore fields to serialise into a jsonb column rather than map field by field. */
  jsonb?: string[];
  /** Also copy documents that exist only as the parent of a subcollection, as id-only rows. */
  includeMissingDocs?: boolean;
};

/** Anything shaped enough like a Firestore DocumentSnapshot for buildRow. */
export type DocLike = { id: string; data(): Record<string, unknown> };

/** Anything shaped enough like a node-postgres client for the query helpers. */
export type ClientLike = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

export declare const TABLES: readonly TableSpec[];

/** Firestore fields never copied to a column. */
export declare const SKIP_FIELDS: ReadonlySet<string>;

/** Must stay byte-identical to camelToSnake in src/lib/postgres-mapping.ts. */
export declare function camelToSnake(field: string): string;

export declare function buildRow(spec: TableSpec, parentId: string | null, doc: DocLike): Record<string, unknown>;

/** The set of columns `public.<table>` actually has. Throws if the table is absent. */
/** Anything shaped enough like a Firestore Firestore instance for readDocs. */
export type FirestoreLike = {
  collection(name: string): {
    get(): Promise<{ docs: DocLike[] }>;
    listDocuments(): Promise<Array<{ id: string; collection(name: string): { get(): Promise<{ docs: DocLike[] }> } }>>;
  };
  getAll(...refs: Array<{ id: string }>): Promise<Array<DocLike & { exists: boolean }>>;
};

/** Reads every document a spec copies, with its parent id for flattened subcollections. */
export declare function readDocs(db: FirestoreLike, spec: TableSpec): Promise<Array<{ parentId: string | null; doc: DocLike }>>;

export declare function knownColumns(client: ClientLike, table: string): Promise<Set<string>>;

/** Removes keys with no column, reporting which field names were dropped. */
export declare function stripUnknownColumns(
  rows: Array<Record<string, unknown>>,
  allowed: Set<string>,
): { rows: Array<Record<string, unknown>>; dropped: Set<string> };

export declare function upsert(client: ClientLike, spec: TableSpec, rows: Array<Record<string, unknown>>): Promise<number>;

/**
 * Collapses rows sharing a primary key, keeping the last. Postgres refuses a
 * multi-row upsert that touches one row twice.
 */
export declare function dedupeByPk(
  rows: Array<Record<string, unknown>>,
  pk: string,
): { rows: Array<Record<string, unknown>>; duplicates: Set<string> };
