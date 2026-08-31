import "server-only";

export type SwissNodeModule = typeof import("@swisseph/node");

export function getSwissNode(): SwissNodeModule {
  if (typeof window !== "undefined") {
    throw new Error("@swisseph/node must only be used on the server.");
  }

  // Lazy require keeps the native addon out of the Next.js client bundle and avoids
  // bundler pre-resolution during production page-data collection.
  const swiss = require("@swisseph/node") as SwissNodeModule;
  return swiss;
}
