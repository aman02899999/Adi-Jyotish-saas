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
          <Link
            href={pathname}
            locale={item}
            className={item === locale ? "active" : undefined}
            // next-intl's own cookie already carries the choice for this browser; this also records
            // it against the signed-in member so it follows them to another device. Fire-and-forget
            // on purpose — the navigation must not wait on it, and for a signed-out visitor the
            // route is a deliberate no-op.
            onClick={() => {
              void fetch("/api/member/locale", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locale: item }),
              }).catch(() => {});
            }}
          >
            {compact ? item.toUpperCase() : localeNames[item]}
          </Link>
        </span>
      ))}
    </div>
  );
}
