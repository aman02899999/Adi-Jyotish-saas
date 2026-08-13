"use client";

import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { locales, localeNames } from "@/i18n/routing";

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("LanguageSwitcher");

  return (
    <div className="language-switcher" aria-label={t("label")}>
      <Languages size={15} />
      {locales.map((item, index) => (
        <span key={item}>
          {index > 0 && <i aria-hidden="true">/</i>}
          <Link href={pathname} locale={item} className={item === locale ? "active" : undefined}>
            {compact ? item.toUpperCase() : localeNames[item]}
          </Link>
        </span>
      ))}
    </div>
  );
}
