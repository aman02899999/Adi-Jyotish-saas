"use client";

import { useEffect, useState } from "react";

// Same fallback values as site-content.ts's DEFAULT_FOOTER.blurb and studio-settings.ts's default
// supportEmail — matches what an unedited install would show, so there's no visible flash while
// the client fetch resolves, and nothing breaks if an admin has never touched these settings.
const DEFAULT_BLURB = "Ancient wisdom for modern life.\nMade thoughtfully in the present.";
const DEFAULT_SUPPORT_EMAIL = "support@adijyotishguru.com";

function useFooterContent() {
  const [content, setContent] = useState({ blurb: DEFAULT_BLURB, supportEmail: DEFAULT_SUPPORT_EMAIL });
  useEffect(() => {
    fetch("/api/footer-content")
      .then((response) => response.json())
      .then((data: { blurb: string; supportEmail: string }) => setContent(data))
      .catch(() => {});
  }, []);
  return content;
}

export function FooterBlurb() {
  const { blurb } = useFooterContent();
  return <p>{blurb.split("\n").map((line, index) => <span key={index}>{index > 0 && <br />}{line}</span>)}</p>;
}

export function FooterSupportEmail() {
  const { supportEmail } = useFooterContent();
  return <a href={`mailto:${supportEmail}`}>{supportEmail}</a>;
}
