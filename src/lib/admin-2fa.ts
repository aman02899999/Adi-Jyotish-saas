import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { admin2faChallenges, adminUsers } from "@/db/schema";

const CHALLENGE_MINUTES = 5;
const BACKUP_CODE_COUNT = 8;
/** Allows a code from the previous or next 30s step, absorbing normal clock drift between the admin's device and the server. */
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

export async function consumeBackupCode(adminId: number, code: string) {
  const [admin] = await db.select({ totpBackupCodes: adminUsers.totpBackupCodes }).from(adminUsers).where(eq(adminUsers.id, adminId)).limit(1);
  const codes = admin?.totpBackupCodes ?? [];
  const digest = tokenDigest(code.trim().toUpperCase());
  if (!codes.includes(digest)) return false;
  await db.update(adminUsers).set({ totpBackupCodes: codes.filter((existing) => existing !== digest) }).where(eq(adminUsers.id, adminId));
  return true;
}

export async function createTwoFactorChallenge(adminId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000);
  await db.delete(admin2faChallenges).where(eq(admin2faChallenges.adminId, adminId));
  await db.insert(admin2faChallenges).values({ adminId, tokenHash: tokenDigest(token), expiresAt });
  return token;
}

/** Looks up the pending challenge without consuming it, so a mistyped code can be retried until it expires or the caller explicitly deletes it. */
export async function peekTwoFactorChallenge(token: string) {
  const [challenge] = await db
    .select()
    .from(admin2faChallenges)
    .where(and(eq(admin2faChallenges.tokenHash, tokenDigest(token)), gt(admin2faChallenges.expiresAt, new Date())))
    .limit(1);
  return challenge?.adminId ?? null;
}

export async function deleteTwoFactorChallenge(token: string) {
  await db.delete(admin2faChallenges).where(eq(admin2faChallenges.tokenHash, tokenDigest(token)));
}
