import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { memberSessions, memberUsers } from "@/db/schema";

const COOKIE_NAME = "jyotish_member_session";
const SESSION_DAYS = 14;

export type MemberIdentity = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  plan: string;
  onboardingComplete: boolean;
  emailVerified: boolean;
  totpEnabled: boolean;
};

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createMemberSession(memberId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(memberSessions).where(lt(memberSessions.expiresAt, new Date()));
  await db.insert(memberSessions).values({ memberId, tokenHash: digest(token), expiresAt });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentMember(): Promise<MemberIdentity | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [member] = await db.select({
    id: memberUsers.id,
    name: memberUsers.name,
    email: memberUsers.email,
    phone: memberUsers.phone,
    birthDate: memberUsers.birthDate,
    birthTime: memberUsers.birthTime,
    birthPlace: memberUsers.birthPlace,
    plan: memberUsers.plan,
    onboardingComplete: memberUsers.onboardingComplete,
    emailVerified: memberUsers.emailVerified,
    totpEnabled: memberUsers.totpEnabled,
  }).from(memberSessions)
    .innerJoin(memberUsers, eq(memberSessions.memberId, memberUsers.id))
    .where(and(
      eq(memberSessions.tokenHash, digest(token)),
      gt(memberSessions.expiresAt, new Date()),
      eq(memberUsers.active, true),
    ))
    .limit(1);

  return member ?? null;
}

export async function revokeMemberSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.delete(memberSessions).where(eq(memberSessions.tokenHash, digest(token)));
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}
