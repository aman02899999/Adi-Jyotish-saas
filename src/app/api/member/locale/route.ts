import { getCurrentMember, setMemberLocale } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * Stores the member's language choice on their account, so switching language sticks across
 * devices instead of living only in the browser's detection cookie.
 *
 * Anonymous visitors are a no-op rather than an error: the language switcher is shown to everyone,
 * and for a signed-out visitor next-intl's cookie alone is the right amount of persistence.
 */
export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ ok: true, stored: false });

  const body = (await request.json()) as { locale?: string };
  const locale = body.locale?.trim() ?? "";
  const stored = await setMemberLocale(member.id, locale);
  if (!stored) return Response.json({ error: "That language is not available." }, { status: 400 });
  return Response.json({ ok: true, stored: true });
}
