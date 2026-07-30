import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { member2faChallenges, memberUsers } from "@/db/schema";

const CHALLENGE_MINUTES = 5;
const BACKUP_CODE_COUNT = 8;
const EPOCH_TOLERANCE_SECONDS = 30;

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateTotpSecret() {
  return generateSecret();
}

export async function getTotpQrDataUrl(secret: string, email: string) {
  const uri = generateURI({ issuer: "Adi Jyotish Guru", label: email, secret });
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

export async function verifyTotpCode(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const result = await verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE_SECONDS });
    return result.valid;
  } catch {
    return false;
  }
}

function randomBackupCode() {
  return randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-");
}

export function generateBackupCodes() {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, randomBackupCode);
  return { codes, hashed: codes.map(tokenDigest) };
}

export async function consumeBackupCode(memberId: number, code: string) {
  const [member] = await db.select({ totpBackupCodes: memberUsers.totpBackupCodes }).from(memberUsers).where(eq(memberUsers.id, memberId)).limit(1);
  const codes = member?.totpBackupCodes ?? [];
  const digest = tokenDigest(code.trim().toUpperCase());
  if (!codes.includes(digest)) return false;
  await db.update(memberUsers).set({ totpBackupCodes: codes.filter((existing) => existing !== digest) }).where(eq(memberUsers.id, memberId));
  return true;
}

export async function createTwoFactorChallenge(memberId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000);
  await db.delete(member2faChallenges).where(eq(member2faChallenges.memberId, memberId));
  await db.insert(member2faChallenges).values({ memberId, tokenHash: tokenDigest(token), expiresAt });
  return token;
}

export async function peekTwoFactorChallenge(token: string) {
  const [challenge] = await db
    .select()
    .from(member2faChallenges)
    .where(and(eq(member2faChallenges.tokenHash, tokenDigest(token)), gt(member2faChallenges.expiresAt, new Date())))
    .limit(1);
  return challenge?.memberId ?? null;
}

export async function deleteTwoFactorChallenge(token: string) {
  await db.delete(member2faChallenges).where(eq(member2faChallenges.tokenHash, tokenDigest(token)));
}
