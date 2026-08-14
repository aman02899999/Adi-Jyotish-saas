import { getTranslations } from "next-intl/server";
import { Lock, ShieldCheck, UserCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getFooterContent } from "@/lib/site-content";
import { getStudioSettings } from "@/lib/studio-settings";

export async function SiteFooter() {
  const [footer, t, settings] = await Promise.all([getFooterContent(), getTranslations("Footer"), getStudioSettings()]);
  return (
    <footer className="footer shell">
      <BrandMark />
      <p>{footer.blurb.split("\n").map((line, index) => <span key={index}>{index > 0 && <br />}{line}</span>)}</p>
      <div className="footer__links">
        <Link href="/about">{t("about")}</Link>
        <Link href="/contact">{t("contact")}</Link>
        <Link href="/astrologers">{t("practitioners")}</Link>
        <Link href="/blog">{t("journal")}</Link>
        <Link href="/pricing">{t("pricing")}</Link>
        <Link href="/dashboard">{t("dashboard")}</Link>
      </div>
      <small>{t("copyright", { year: new Date().getFullYear() })} · <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></small>
      <div className="footer__trust">
        <span><ShieldCheck size={14} /> {t("trustSecure")}</span>
        <span><UserCheck size={14} /> {t("trustReviewed")}</span>
        <span><Lock size={14} /> {t("trustPrivate")}</span>
      </div>
      <div className="footer__legal">
        <Link href="/terms">{t("terms")}</Link>
        <Link href="/privacy">{t("privacy")}</Link>
        <Link href="/refund-policy">{t("refundPolicy")}</Link>
        <Link href="/practitioner/login">{t("practitionerSignIn")}</Link>
        <Link href="/admin/login">{t("studioAdmin")}</Link>
        <span>{t("disclaimer")}</span>
      </div>
    </footer>
  );
}
