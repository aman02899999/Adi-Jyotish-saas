import { AdminPanel } from "@/components/admin-panel";
import { AdminShell } from "@/components/admin-shell";
import { getAllServices } from "@/lib/services";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  await requireAdminPage("services");
  const services = await getAllServices();
  return <AdminShell active="Services"><div className="admin-content"><div className="admin-heading"><div><p>Jyotish / Catalogue</p><h1>Services</h1><span>Create, publish and manage your astrology offerings.</span></div><div><small>Last synced</small><strong>Just now <i /></strong></div></div><AdminPanel initialServices={services} /></div></AdminShell>;
}
