/** JSON.stringify does not escape `<`, so any user-controlled string reaching `data` (e.g. a
 * practitioner's bio) could otherwise contain `</script><script>...` and break out of this tag —
 * a stored-XSS vector against every visitor of the page. Escaping to the equivalent \u unicode
 * sequences keeps the JSON semantically identical (a conforming JSON parser reads \u003c as "<")
 * while making it impossible for the raw characters to ever appear in the HTML. */
function safeJsonLd(data: Record<string, unknown>) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />;
}
