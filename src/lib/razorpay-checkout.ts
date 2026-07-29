"use client";

type RazorpayCheckoutHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount?: number;
  currency?: string;
  order_id?: string;
  subscription_id?: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayCheckoutHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<boolean> | null = null;

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => {
      scriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export async function openRazorpayCheckout(options: Omit<RazorpayCheckoutOptions, "handler"> & {
  onSuccess: (response: RazorpayCheckoutHandlerResponse) => void;
  onDismiss?: () => void;
}) {
  const ready = await loadRazorpayScript();
  if (!ready || !window.Razorpay) {
    throw new Error("Payment widget could not be loaded. Check your connection and try again.");
  }

  const { onSuccess, onDismiss, ...rest } = options;
  const checkout = new window.Razorpay({
    ...rest,
    handler: onSuccess,
    modal: { ondismiss: onDismiss },
  });
  checkout.open();
}
