import type { RailItem } from "@/components/live-offer-rail";

/**
 * What the homepage's live rail says, from live facts only. Each item needs something true behind
 * it: no one online means no "online now" item, and a rating needs enough genuine reviews to mean
 * something. The free chart leads because it is the one thing every visitor can do at once.
 */
export function buildRailItems({ onlineCount, averageRating, reviewCount, abhijit, moonNakshatra, refereeReward, referrerReward, giftFrom, timeZone = "Asia/Kolkata" }: {
  onlineCount: number;
  averageRating: number;
  reviewCount: number;
  abhijit: { start: string; end: string } | null;
  moonNakshatra: string | null;
  refereeReward: number;
  referrerReward: number;
  giftFrom: number;
  timeZone?: string;
}): RailItem[] {
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone });
  const items: RailItem[] = [{ icon: "chart", text: "See your real birth chart in about 10 seconds, free and private", cta: "Try it", href: "/#free-chart" }];

  if (onlineCount > 0) items.push({ icon: "chat", text: `${onlineCount} ${onlineCount === 1 ? "astrologer is" : "astrologers are"} online right now`, cta: "Chat now", href: "/astrologers" });
  if (abhijit) items.push({ icon: "muhurat", text: `Today's Abhijit Muhurat: ${time(abhijit.start)} to ${time(abhijit.end)} (New Delhi)`, cta: "Plan your day", href: "/muhurat" });
  if (moonNakshatra) items.push({ icon: "moon", text: `The Moon is in ${moonNakshatra} today`, cta: "Your horoscope", href: "/horoscope" });
  if (averageRating > 0 && reviewCount >= 5) items.push({ icon: "rating", text: `Rated ${averageRating.toFixed(1)} out of 5 in ${reviewCount} verified reviews`, cta: "Meet the astrologers", href: "/astrologers" });
  items.push({ icon: "invite", text: `Invite a friend: they get ₹${refereeReward} and you get ₹${referrerReward} in wallet credit`, cta: "Invite", href: "/dashboard/referrals" });
  items.push({ icon: "gift", text: `Gift a reading to someone you love, from ₹${giftFrom}`, cta: "Send a gift", href: "/gift" });
  return items;
}
