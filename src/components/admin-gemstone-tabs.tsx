import { Link } from "@/i18n/navigation";

const tabs = [
  { label: "Overview", href: "/admin/gemstones" },
  { label: "Products", href: "/admin/gemstones/products" },
  { label: "Categories", href: "/admin/gemstones/categories" },
  { label: "Orders", href: "/admin/gemstones/orders" },
  { label: "Coupons", href: "/admin/gemstones/coupons" },
  { label: "Reviews", href: "/admin/gemstones/reviews" },
];

export function AdminGemstoneTabs({ active }: { active: string }) {
  return (
    <nav className="gemstone-admin-tabs" aria-label="Gemstone store sections">
      {tabs.map((tab) => (
        <Link key={tab.label} href={tab.href} className={tab.label === active ? "active" : ""}>{tab.label}</Link>
      ))}
    </nav>
  );
}
