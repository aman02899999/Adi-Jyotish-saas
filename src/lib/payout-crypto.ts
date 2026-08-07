import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function isPayoutEncryptionConfigured() {
  return Boolean(process.env.PAYOUT_ENCRYPTION_KEY);
}

function getKey() {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) throw new Error("PAYOUT_ENCRYPTION_KEY is not configured — bank/UPI details cannot be saved yet.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PAYOUT_ENCRYPTION_KEY must decode to 32 bytes (generate with: openssl rand -base64 32).");
  return key;
}

/** AES-256-GCM, stored as base64(iv):base64(authTag):base64(ciphertext) so decryption never needs a second lookup. */
export function encryptPayoutField(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptPayoutField(stored: string) {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function maskAccountNumber(decrypted: string) {
  return decrypted.length > 4 ? `•••• ${decrypted.slice(-4)}` : "••••";
}
