import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

const navigation = createNavigation(routing);
export const { Link, usePathname, useRouter, getPathname } = navigation;

/** navigation.redirect's inferred return type collapses to `any` under this project's
 * moduleResolution:"bundler" setting (the conditional `href` type next-intl uses for redirect/
 * permanentRedirect doesn't fully resolve here, unlike Link/useRouter which type fine) — every
 * `if (!x) redirect(...)` call site in this codebase relies on TypeScript treating the code after
 * it as unreachable, which only happens with a real `never` return type. This thin wrapper
 * restores that by declaring `never` explicitly rather than trusting the inferred signature. */
export function redirect(args: { href: string; locale: string }): never {
  navigation.redirect(args);
  throw new Error("unreachable");
}
