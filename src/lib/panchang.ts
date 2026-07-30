import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyPanchang } from "@/db/schema";
import { getPanchangText, isGeminiConfigured } from "@/lib/gemini";
import { todayCivilDate } from "@/lib/horoscopes";

export async function getTodayPanchang() {
  const date = await todayCivilDate();

  const [existing] = await db.select().from(dailyPanchang).where(eq(dailyPanchang.date, date)).limit(1);
  if (existing) return existing;

  if (!isGeminiConfigured()) throw new Error("Panchang is not configured yet. Please try again shortly.");
  const content = await getPanchangText({ date });

  await db.insert(dailyPanchang).values({ date, content }).onConflictDoNothing({ target: dailyPanchang.date });
  const [row] = await db.select().from(dailyPanchang).where(eq(dailyPanchang.date, date)).limit(1);
  return row!;
}
