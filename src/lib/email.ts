import "server-only";

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email skipped — RESEND_API_KEY not set] to=${to} subject=${subject}`);
    return { sent: false as const };
  }

  const from = process.env.RESEND_FROM_EMAIL || "Jyotish Studio <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`Email send failed (${response.status}): ${detail.slice(0, 300)}`);
    return { sent: false as const };
  }
  return { sent: true as const };
}

export function genericNotificationEmailHtml({ title, name, body, ctaLabel, ctaUrl }: { title: string; name: string; body: string; ctaLabel?: string; ctaUrl?: string }) {
  return `
  <div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#302822;">
    <h2 style="color:#a95838;">${title}</h2>
    <p>Hi ${name},</p>
    <p>${body}</p>
    ${ctaUrl ? `<p><a href="${ctaUrl}" style="display:inline-block;padding:12px 22px;background:#a95838;color:#fff;text-decoration:none;border-radius:8px;">${ctaLabel ?? "View details"}</a></p>` : ""}
    <p style="margin-top:24px;font-size:12px;color:#aa9d90;">Jyotish Studio</p>
  </div>`;
}

export function orderConfirmationEmailHtml({ orderNumber, customerName, items, subtotal, discount, shippingFee, total, currency }: {
  orderNumber: string;
  customerName: string;
  items: Array<{ productName: string; variantLabel: string; quantity: number; lineTotal: number }>;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  currency: string;
}) {
  const rows = items.map((item) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;">${item.productName} — ${item.variantLabel} × ${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${currency} ${item.lineTotal}</td></tr>`).join("");
  return `
  <div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#302822;">
    <h2 style="color:#a95838;">Your order is confirmed</h2>
    <p>Hi ${customerName}, thank you for your order. Here is your receipt.</p>
    <p style="font-size:13px;color:#776b61;">Order ${orderNumber}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
    <table style="width:100%;margin-top:12px;font-size:14px;">
      <tr><td>Subtotal</td><td style="text-align:right;">${currency} ${subtotal}</td></tr>
      ${discount ? `<tr><td>Discount</td><td style="text-align:right;">-${currency} ${discount}</td></tr>` : ""}
      <tr><td>Shipping</td><td style="text-align:right;">${shippingFee ? `${currency} ${shippingFee}` : "Free"}</td></tr>
      <tr><td style="font-weight:bold;padding-top:8px;">Total</td><td style="text-align:right;font-weight:bold;padding-top:8px;">${currency} ${total}</td></tr>
    </table>
    <p style="margin-top:24px;font-size:12px;color:#aa9d90;">Jyotish Studio · Genuine Vedic Gemstones</p>
  </div>`;
}
