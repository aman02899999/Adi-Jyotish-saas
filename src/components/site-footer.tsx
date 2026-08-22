import { getTranslations } from "next-intl/server";
import { Lock, ShieldCheck, UserCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BrandMark } from "@/components/brand-mark";
import { FooterBlurb, FooterSupportEmail } from "@/components/footer-dynamic-text";

// Deliberately does NOT read getFooterContent()/getStudioSettings() here (that used to call
// Firestore on every server render of every page, via this footer). FooterBlurb/FooterSupportEmail
// fetch those two DB-driven fields client-side instead — see /api/footer-content's route comment.
export async function SiteFooter() {
  const t = await getTranslations("Footer");
  return (
    <footer className="footer shell">
      <BrandMark />
      <FooterBlurb />
      <div className="footer__links">
        <Link href="/about">{t("about")}</Link>
        <Link href="/contact">{t("contact")}</Link>
        <Link href="/astrologers">{t("practitioners")}</Link>
        <Link href="/blog">{t("journal")}</Link>
        <Link href="/pricing">{t("pricing")}</Link>
        <Link href="/dashboard">{t("dashboard")}</Link>
      </div>
      <small>{t("copyright", { year: new Date().getFullYear() })} · <FooterSupportEmail /></small>
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
