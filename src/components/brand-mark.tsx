import Link from "next/link";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand-mark" aria-label="Adi Jyotish Gurus home">
      {/* eslint-disable-next-line @next/next/no-img-element -- small fixed logo asset, not worth next/image's overhead here.
          width/height attributes (not just CSS) matter here: without them the browser can't reserve
          the image's layout box before it decodes, and the nav item after it renders on top. */}
      <img className="brand-mark__logo" src="/images/logo-mark.png" alt="" aria-hidden="true" width={231} height={124} />
      {!compact && (
        <span className="brand-copy">
          <strong>Adi Jyotish Gurus</strong>
          <small>Vedic wisdom</small>
        </span>
      )}
    </Link>
  );
}
