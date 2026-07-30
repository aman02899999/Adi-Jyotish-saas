import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { practitioner2faChallenges, practitioners } from "@/db/schema";

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

export async function consumeBackupCode(practitionerId: number, code: string) {
  const [practitioner] = await db.select({ totpBackupCodes: practitioners.totpBackupCodes }).from(practitioners).where(eq(practitioners.id, practitionerId)).limit(1);
  const codes = practitioner?.totpBackupCodes ?? [];
  const digest = tokenDigest(code.trim().toUpperCase());
  if (!codes.includes(digest)) return false;
  await db.update(practitioners).set({ totpBackupCodes: codes.filter((existing) => existing !== digest) }).where(eq(practitioners.id, practitionerId));
  return true;
}

export async function createTwoFactorChallenge(practitionerId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000);
  await db.delete(practitioner2faChallenges).where(eq(practitioner2faChallenges.practitionerId, practitionerId));
  await db.insert(practitioner2faChallenges).values({ practitionerId, tokenHash: tokenDigest(token), expiresAt });
  return token;
}

export async function peekTwoFactorChallenge(token: string) {
  const [challenge] = await db
    .select()
    .from(practitioner2faChallenges)
    .where(and(eq(practitioner2faChallenges.tokenHash, tokenDigest(token)), gt(practitioner2faChallenges.expiresAt, new Date())))
    .limit(1);
  return challenge?.practitionerId ?? null;
}

export async function deleteTwoFactorChallenge(token: string) {
  await db.delete(practitioner2faChallenges).where(eq(practitioner2faChallenges.tokenHash, tokenDigest(token)));
}
