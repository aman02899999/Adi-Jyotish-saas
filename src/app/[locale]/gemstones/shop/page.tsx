import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

export const metadata: Metadata = { title: "Buy Gemstones · Coming Soon" };

// The storefront is offline for now — see the comment atop /gemstones/page.tsx.
export default async function GemstoneShopPage() {
  redirect({ href: "/gemstones", locale: await getLocale() });
}
