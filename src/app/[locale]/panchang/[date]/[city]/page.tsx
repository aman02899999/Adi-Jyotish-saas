import type { Metadata } from "next";
import { PanchangDatePage, panchangDateMetadata } from "@/components/panchang-date-page";

// Same page as /panchang/[date], for one of the listed cities. See the note there on caching.
export const revalidate = 604800;

export function generateStaticParams() {
  return [];
}

type Params = Promise<{ locale: string; date: string; city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, date, city } = await params;
  return panchangDateMetadata(locale, date, city);
}

export default async function PanchangByDateAndCityPage({ params }: { params: Params }) {
  const { locale, date, city } = await params;
  return <PanchangDatePage locale={locale} dateParam={date} citySlug={city} />;
}
