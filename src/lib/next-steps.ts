/**
 * Where each public page sends a visitor next. One main step and one alternative per page, chosen
 * by what the visitor was just doing: a reader is offered their own free chart before anything
 * paid, a free-tool result is offered the person or report that goes deeper. The copy lives in
 * messages/*.json under "NextStep", keyed the same way.
 */
export type NextStepLink = { href: string; event: string };
export type NextStepKey = "about" | "blogPost" | "festivals" | "horoscope" | "panchang" | "numerology" | "muhurat" | "kundliMatching";

const freeChart = "/#free-chart";

export const NEXT_STEPS: Record<NextStepKey, { primary: NextStepLink; secondary: NextStepLink }> = {
  about: {
    primary: { href: freeChart, event: "next_step_free_chart" },
    secondary: { href: "/astrologers", event: "next_step_astrologers" },
  },
  blogPost: {
    primary: { href: freeChart, event: "next_step_free_chart" },
    secondary: { href: "/book", event: "next_step_book" },
  },
  festivals: {
    primary: { href: "/muhurat", event: "next_step_muhurat" },
    secondary: { href: "/panchang", event: "next_step_panchang" },
  },
  horoscope: {
    primary: { href: freeChart, event: "next_step_free_chart" },
    secondary: { href: "/ask", event: "next_step_ask" },
  },
  panchang: {
    primary: { href: "/muhurat", event: "next_step_muhurat" },
    secondary: { href: "/kundli", event: "next_step_kundli" },
  },
  numerology: {
    primary: { href: freeChart, event: "next_step_free_chart" },
    secondary: { href: "/ask", event: "next_step_ask" },
  },
  muhurat: {
    primary: { href: "/book", event: "next_step_book" },
    secondary: { href: "/panchang", event: "next_step_panchang" },
  },
  kundliMatching: {
    primary: { href: "/astrologers?q=marriage", event: "next_step_astrologers" },
    secondary: { href: "/kundli", event: "next_step_kundli" },
  },
};
