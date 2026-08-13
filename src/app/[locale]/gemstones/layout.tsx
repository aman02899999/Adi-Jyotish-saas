import type { ReactNode } from "react";
import { GemstoneCartProvider } from "@/components/gemstone-cart-context";

export default function GemstonesLayout({ children }: { children: ReactNode }) {
  return <GemstoneCartProvider>{children}</GemstoneCartProvider>;
}
