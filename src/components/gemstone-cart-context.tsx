"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = {
  variantId: number;
  productId: number;
  slug: string;
  productName: string;
  variantLabel: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  currency: string;
  quantity: number;
  maxQuantity: number;
};

const STORAGE_KEY = "jyotish_gem_cart_v1";

type CartContextValue = {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  updateQuantity: (variantId: number, quantity: number) => void;
  removeLine: (variantId: number) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);

function readStoredCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function GemstoneCartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Reading localStorage during the initial render (instead of here) would mismatch the server-rendered empty cart and trigger a hydration error.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLines(readStoredCart()); setHydrated(true); }, []);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    window.dispatchEvent(new CustomEvent("gemstone-cart-updated"));
  }, [lines, hydrated]);

  const addLine = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((item) => item.variantId === line.variantId);
      if (existing) {
        const nextQuantity = Math.min(existing.maxQuantity, existing.quantity + quantity);
        return current.map((item) => item.variantId === line.variantId ? { ...item, quantity: nextQuantity } : item);
      }
      return [...current, { ...line, quantity: Math.min(line.maxQuantity, Math.max(1, quantity)) }];
    });
  }, []);

  const updateQuantity = useCallback((variantId: number, quantity: number) => {
    setLines((current) => current
      .map((item) => item.variantId === variantId ? { ...item, quantity: Math.min(item.maxQuantity, Math.max(1, quantity)) } : item)
      .filter((item) => item.quantity > 0));
  }, []);

  const removeLine = useCallback((variantId: number) => {
    setLines((current) => current.filter((item) => item.variantId !== variantId));
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.price * line.quantity, 0), [lines]);
  const itemCount = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines]);

  const value = useMemo(() => ({ lines, addLine, updateQuantity, removeLine, clearCart, subtotal, itemCount }), [lines, addLine, updateQuantity, removeLine, clearCart, subtotal, itemCount]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useGemstoneCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useGemstoneCart must be used within GemstoneCartProvider");
  return context;
}
