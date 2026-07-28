import Link from "next/link";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand-mark" aria-label="Jyotish home">
      <span className="zodiac-mark" aria-hidden="true">
        <span>✦</span>
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>Jyotish</strong>
          <small>Vedic wisdom</small>
        </span>
      )}
    </Link>
  );
}
