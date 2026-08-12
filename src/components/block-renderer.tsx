import Link from "next/link";
import type { PageBlock } from "@/lib/custom-pages";

function asString(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asList(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

export function BlockRenderer({ blocks }: { blocks: PageBlock[] }) {
  return (
    <>
      {blocks.map((block) => {
        switch (block.type) {
          case "hero":
            return (
              <section className="cp-hero shell" key={block.id}>
                {asString(block.data.eyebrow) && <p className="eyebrow"><span /> {asString(block.data.eyebrow)}</p>}
                <h1>{asString(block.data.heading, "Untitled")}</h1>
                {asString(block.data.subheading) && <p className="cp-hero__lead">{asString(block.data.subheading)}</p>}
              </section>
            );
          case "richtext":
            return (
              <section className="cp-richtext shell" key={block.id}>
                {asString(block.data.heading) && <h2>{asString(block.data.heading)}</h2>}
                {asString(block.data.body).split("\n\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </section>
            );
          case "imagetext":
            return (
              <section className="cp-imagetext shell" key={block.id}>
                {asString(block.data.imageUrl) && <img src={asString(block.data.imageUrl)} alt={asString(block.data.heading)} />}
                <div>
                  {asString(block.data.heading) && <h2>{asString(block.data.heading)}</h2>}
                  {asString(block.data.body).split("\n\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
              </section>
            );
          case "cta":
            return (
              <section className="cp-cta shell" key={block.id}>
                <div>
                  {asString(block.data.heading) && <h2>{asString(block.data.heading)}</h2>}
                  {asString(block.data.body) && <p>{asString(block.data.body)}</p>}
                </div>
                {asString(block.data.buttonLabel) && <Link href={asString(block.data.buttonHref, "/")} className="button">{asString(block.data.buttonLabel)}</Link>}
              </section>
            );
          case "faq":
            return (
              <section className="cp-faq shell" key={block.id}>
                {asString(block.data.heading) && <h2>{asString(block.data.heading)}</h2>}
                <div className="cp-faq__list">
                  {asList(block.data.questions).map((q, index) => {
                    const [question, ...answerParts] = q.split("::");
                    return (
                      <details key={index}>
                        <summary>{question}</summary>
                        <p>{answerParts.join("::").trim()}</p>
                      </details>
                    );
                  })}
                </div>
              </section>
            );
          case "stats":
            return (
              <section className="cp-stats shell" key={block.id}>
                {asList(block.data.items).map((item, index) => {
                  const [value, label] = item.split("::");
                  return <div key={index}><strong>{value}</strong><span>{label}</span></div>;
                })}
              </section>
            );
          case "spacer":
            return <div key={block.id} style={{ height: Number(asString(block.data.height, "40")) || 40 }} />;
          default:
            return null;
        }
      })}
    </>
  );
}
