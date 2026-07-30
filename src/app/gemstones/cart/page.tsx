import type { Metadata } from "next";
import { GemstoneCartView } from "@/components/gemstone-cart-view";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Cart · Buy Gemstones" };

export default function GemstoneCartPage() {
  return (
    <main className="marketing-page gem-store">
      <SiteHeader />
      <GemstoneCartView />
    <SiteFooter />
    </main>
  );
}
