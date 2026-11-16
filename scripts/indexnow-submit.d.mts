/**
 * Types for the IndexNow submit script. The script is plain ESM so it runs with
 * `node scripts/indexnow-submit.mjs` and no build step; this declaration is what the test imports
 * against. If you change a signature in the script, change it here too.
 */

export declare const INDEXNOW_KEY: string;
export declare const INDEXNOW_ENDPOINT: string;
export declare const DEFAULT_SITE_URL: string;
export declare const MAX_URLS_PER_REQUEST: number;
export declare const PRIVATE_PATH_PREFIXES: string[];

export type IndexNowPayload = { host: string; key: string; keyLocation: string; urlList: string[] };

export function extractSitemapUrls(xml: string): string[];
export function normalizeUrls(inputs: string[], siteUrl: string): string[];
export function buildPayloads(urls: string[], siteUrl: string, key?: string): IndexNowPayload[];
