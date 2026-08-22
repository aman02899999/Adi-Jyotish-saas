import { GlossaryTerm } from "@/components/glossary-term";
import type { GlossaryKey } from "@/lib/glossary";

/** A compact "quick glossary" row for jargon-heavy pages — surfaces the handful of Sanskrit terms
 * a page depends on right under its heading, each tappable for a one-line plain-language definition,
 * instead of leaving a first-time visitor to guess or bounce. */
export function GlossaryStrip({ terms }: { terms: GlossaryKey[] }) {
  return (
    <p className="glossary-strip">
      <span className="glossary-strip__label">New to these terms?</span>
      {terms.map((key, index) => (
        <span key={key}>
          <GlossaryTerm termKey={key} />
          {index < terms.length - 1 && <span aria-hidden="true"> · </span>}
        </span>
      ))}
    </p>
  );
}
