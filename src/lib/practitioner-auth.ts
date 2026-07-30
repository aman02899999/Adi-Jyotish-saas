import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { practitionerSessions, practitioners } from "@/db/schema";

const COOKIE_NAME = "jyotish_practitioner_session";
const SESSION_DAYS = 14;

export type PractitionerIdentity = {
  id: number;
  name: string;
  slug: string;
  email: string;
  title: string;
  photoUrl: string | null;
};

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPractitionerSession(practitionerId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(practitionerSessions).where(lt(practitionerSessions.expiresAt, new Date()));
  await db.insert(practitionerSessions).values({ practitionerId, tokenHash: digest(token), expiresAt });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentPractitioner(): Promise<PractitionerIdentity | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [practitioner] = await db.select({
    id: practitioners.id,
    name: practitioners.name,
    slug: practitioners.slug,
    email: practitioners.email,
    title: practitioners.title,
    photoUrl: practitioners.photoUrl,
  }).from(practitionerSessions)
    .innerJoin(practitioners, eq(practitionerSessions.practitionerId, practitioners.id))
    .where(and(
      eq(practitionerSessions.tokenHash, digest(token)),
      gt(practitionerSessions.expiresAt, new Date()),
      eq(practitioners.active, true),
    ))
    .limit(1);

  return practitioner ?? null;
}

export async function requirePractitionerPage() {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) redirect("/practitioner/login");
  return practitioner;
}

export async function revokePractitionerSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.delete(practitionerSessions).where(eq(practitionerSessions.tokenHash, digest(token)));
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}
