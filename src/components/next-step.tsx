import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { TrackedLink } from "@/components/tracked-link";
import { AI_KUNDLI_PRICE, AI_READING_PRICE } from "@/lib/ai-readings";
import { NEXT_STEPS, type NextStepKey } from "@/lib/next-steps";

/**
 * The way forward at the end of a page or a free-tool result: one main step, one alternative.
 * Prices come from the same constants the checkout charges, so a label can never show a different
 * amount from the one the visitor pays.
 */
export function NextStep({ page, variant = "section" }: { page: NextStepKey; variant?: "section" | "inline" }) {
  const t = useTranslations("NextStep");
  const { primary, secondary } = NEXT_STEPS[page];
  const prices = { kundliPrice: AI_KUNDLI_PRICE, askPrice: AI_READING_PRICE };
  const body = (
    <>
      <h2>{t(`${page}.title`)}</h2>
      <p>{t(`${page}.body`, prices)}</p>
      <div className="next-step__actions">
        <TrackedLink href={primary.href} className="button" event={primary.event} eventParams={{ from: page, slot: "primary" }}>{t(`${page}.primary`, prices)} <ArrowRight size={16} /></TrackedLink>
        <TrackedLink href={secondary.href} className="button button--ghost" event={secondary.event} eventParams={{ from: page, slot: "secondary" }}>{t(`${page}.secondary`, prices)}</TrackedLink>
      </div>
    </>
  );
  return variant === "inline"
    ? <aside className="next-step next-step--inline">{body}</aside>
    : <section className="next-step shell">{body}</section>;
}
