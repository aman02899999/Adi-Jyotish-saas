import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitionerInvites } from "@/db/schema";

const INVITE_DAYS = 7;

export async function createPractitionerInvite(practitionerId: number, invitedBy: number) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  await db.delete(practitionerInvites).where(eq(practitionerInvites.practitionerId, practitionerId));
  await db.insert(practitionerInvites).values({ practitionerId, tokenHash, invitedBy, expiresAt });
  return token;
}
