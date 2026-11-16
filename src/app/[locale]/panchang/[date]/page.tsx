import type { Metadata } from "next";
import { PanchangDatePage, panchangDateMetadata } from "@/components/panchang-date-page";

// A past or future day's Panchang never changes, so each page is worked out the first time someone
// opens it and then served from cache. Nothing is generated at build time: a hundred years of
// dates would be tens of thousands of pages nobody has asked for yet.
export const revalidate = 604800;

export function generateStaticParams() {
  return [];
}

type Params = Promise<{ locale: string; date: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, date } = await params;
  return panchangDateMetadata(locale, date);
}

export default async function PanchangByDatePage({ params }: { params: Params }) {
  const { locale, date } = await params;
  return <PanchangDatePage locale={locale} dateParam={date} />;
}
