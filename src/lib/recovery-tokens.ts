import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_MINUTES = 30;
export const EMAIL_VERIFICATION_HOURS = 48;

export function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function issueToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: digestToken(token) };
}

export function passwordResetEmailHtml({ name, resetUrl }: { name: string; resetUrl: string }) {
  return `
  <div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#302822;">
    <h2 style="color:#a95838;">Reset your password</h2>
    <p>Hi ${name}, we received a request to reset your Jyotish account password.</p>
    <p><a href="${resetUrl}" style="display:inline-block;padding:12px 22px;background:#a95838;color:#fff;text-decoration:none;border-radius:8px;">Choose a new password</a></p>
    <p style="font-size:13px;color:#776b61;">This link expires in ${PASSWORD_RESET_MINUTES} minutes. If you did not request this, you can safely ignore this email.</p>
  </div>`;
}

export function emailVerificationEmailHtml({ name, verifyUrl }: { name: string; verifyUrl: string }) {
  return `
  <div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#302822;">
    <h2 style="color:#a95838;">Confirm your email</h2>
    <p>Hi ${name}, welcome to Jyotish. Please confirm this is your email address.</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 22px;background:#a95838;color:#fff;text-decoration:none;border-radius:8px;">Confirm my email</a></p>
    <p style="font-size:13px;color:#776b61;">This link expires in ${EMAIL_VERIFICATION_HOURS} hours.</p>
  </div>`;
}
