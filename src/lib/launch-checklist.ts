import "server-only";

import { isEmailConfigured } from "@/lib/email";
import { isGeminiConfigured } from "@/lib/gemini";
import { getOnlineNowCount } from "@/lib/homepage";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { getPublishedServices } from "@/lib/services";
import { isStorageConfigured } from "@/lib/firestore";

/**
 * What stands between this deployment and taking real money, checked live on each load of the admin
 * overview. Each check reads only whether a setting exists, never its value, so nothing secret
 * reaches the page. Before launch, an empty studio's overview was a grid of ₹0 and 0%; this
 * tells the owner what to do next instead.
 */

export type ChecklistItem = { key: string; label: string; done: boolean; why: string; fix: string; href?: string };

export function buildChecklist(state: { razorpay: boolean; webhook: boolean; gemini: boolean; storage: boolean; email: boolean; services: number; online: number }): ChecklistItem[] {
  return [
    { key: "razorpay", label: "Online payments", done: state.razorpay, why: "Members can pay by card, UPI and netbanking.", fix: "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel, then redeploy." },
    { key: "webhook", label: "Razorpay webhook", done: state.webhook, why: "Records a payment even when the member closes the tab before it is confirmed.", fix: "Razorpay → Settings → Webhooks: point it at /api/webhooks/razorpay with payment.captured, and put the same secret in RAZORPAY_WEBHOOK_SECRET." },
    { key: "gemini", label: "Live readings", done: state.gemini, why: "Ask, palm, tarot, face, Vastu, Lal Kitab and AI chats need it. Without it they refuse payment rather than take it.", fix: "Add GEMINI_API_KEY in Vercel, and set a budget alert in Google Cloud.", href: "/admin/ai-personas" },
    { key: "storage", label: "Photo uploads", done: state.storage, why: "Palm and face readings need somewhere to keep the member's photos.", fix: "Add FIREBASE_STORAGE_BUCKET in Vercel (your Firebase project's bucket, e.g. your-project.appspot.com)." },
    { key: "email", label: "Email delivery", done: state.email, why: "Booking confirmations, receipts and sign-in notices reach members.", fix: "Add RESEND_API_KEY in Vercel." },
    { key: "services", label: "Published services", done: state.services > 0, why: "Members need something to book.", fix: "Publish at least one service.", href: "/admin/services" },
    { key: "online", label: "An astrologer online", done: state.online > 0, why: "The homepage and the live strip show who can chat right now.", fix: "Set at least one practitioner online.", href: "/admin/practitioners" },
  ];
}

export async function getLaunchChecklist(): Promise<ChecklistItem[]> {
  const [services, online] = await Promise.all([getPublishedServices().catch(() => []), getOnlineNowCount().catch(() => 0)]);
  return buildChecklist({
    razorpay: isRazorpayConfigured(),
    webhook: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim()),
    gemini: isGeminiConfigured(),
    storage: isStorageConfigured(),
    email: isEmailConfigured(),
    services: services.length,
    online,
  });
}
