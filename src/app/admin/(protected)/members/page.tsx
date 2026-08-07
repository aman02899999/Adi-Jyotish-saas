import { db } from "@/lib/firestore";
import { AdminMembers } from "@/components/admin-members";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic = "force-dynamic";

function toDate(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

export default async function AdminMembersPage() {
  await requireAdminPage("members_view");
  const snap = await db.collection("members").orderBy("name", "asc").get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      name: data.name as string,
      email: data.email as string,
      phone: (data.phone as string | null) ?? null,
      birthDate: (data.birthDate as string | null) ?? null,
      birthTime: (data.birthTime as string | null) ?? null,
      birthPlace: (data.birthPlace as string | null) ?? null,
      plan: (data.plan as string) ?? "member",
      onboardingComplete: Boolean(data.onboardingComplete),
      active: data.active !== false,
      lastLoginAt: toDate(data.lastLoginAt as FirebaseFirestore.Timestamp | undefined),
      createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp | undefined) ?? new Date(),
      updatedAt: toDate(data.updatedAt as FirebaseFirestore.Timestamp | undefined) ?? new Date(),
    };
  });
  return <AdminShell active="Members"><div className="admin-content"><div className="admin-heading"><div><p>Jyotish / Relationships</p><h1>Members</h1><span>Manage customer access, profiles, and membership plans.</span></div><div><small>Directory status</small><strong>Live <i/></strong></div></div><AdminMembers initialMembers={rows}/></div></AdminShell>;
}
