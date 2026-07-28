import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";

export async function getStudioSettings() {
  await db.insert(studioSettings).values({ id: 1 }).onConflictDoNothing({ target: studioSettings.id });
  const [settings] = await db.select().from(studioSettings).where(eq(studioSettings.id, 1)).limit(1);
  return settings;
}
