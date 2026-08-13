import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getFooterContent } from "@/lib/site-content";

export async function SiteFooter() {
  const [footer, t] = await Promise.all([getFooterContent(), getTranslations("Footer")]);
  return (
    <footer className="footer shell">
      <BrandMark />
      <p>{footer.blurb.split("\n").map((line, index) => <span key={index}>{index > 0 && <br />}{line}</span>)}</p>
      <div className="footer__links">
        <Link href="/astrologers">{t("practitioners")}</Link>
        <Link href="/blog">{t("journal")}</Link>
        <Link href="/pricing">{t("pricing")}</Link>
        <Link href="/dashboard">{t("dashboard")}</Link>
      </div>
      <small>{t("copyright", { year: new Date().getFullYear() })}</small>
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
