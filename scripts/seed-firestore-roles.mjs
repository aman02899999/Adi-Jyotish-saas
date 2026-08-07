// Idempotent seeder for the Firestore `adminRoles` collection.
// admin-auth.ts resolves an admin's permissions by reading `adminRoles/{role}`, so this
// collection must contain at least an "owner" role with every permission before anyone can sign
// in as an administrator.
//
// Usage: FIREBASE_SERVICE_ACCOUNT_KEY='<service-account-json>' node scripts/seed-firestore-roles.mjs
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY is required.");
  process.exit(1);
}
const serviceAccount = JSON.parse(raw);

const app = initializeApp({
  credential: cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore(app);

// Mirrors ALL_ADMIN_PERMISSIONS in src/lib/admin-auth.ts — keep in sync if that list changes.
const ALL_PERMISSIONS = [
  "overview", "services", "members_view", "members_manage", "bookings", "schedule", "billing",
  "plans", "reviews", "messages", "insights", "reports", "activity", "settings", "team",
  "gemstones", "roles",
];

const ROLES = [
  { slug: "owner", name: "Owner", isSystem: true, permissions: ALL_PERMISSIONS },
  {
    slug: "manager",
    name: "Manager",
    isSystem: true,
    permissions: ["overview", "services", "members_view", "members_manage", "bookings", "schedule", "billing", "plans", "reviews", "messages", "insights", "reports", "gemstones"],
  },
  {
    slug: "support",
    name: "Support",
    isSystem: true,
    permissions: ["overview", "members_view", "bookings", "messages"],
  },
  {
    slug: "analyst",
    name: "Analyst",
    isSystem: true,
    permissions: ["overview", "insights", "reports"],
  },
];

async function main() {
  for (const role of ROLES) {
    const ref = db.collection("adminRoles").doc(role.slug);
    const snap = await ref.get();
    if (snap.exists) {
      // Keep isSystem/permissions authoritative for built-in roles on every run, but leave a
      // custom `name` edit alone if an operator has already renamed it.
      await ref.set({ isSystem: role.isSystem, permissions: role.permissions, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      console.log(`Updated role: ${role.slug}`);
    } else {
      await ref.set({ name: role.name, isSystem: role.isSystem, permissions: role.permissions, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      console.log(`Created role: ${role.slug}`);
    }
  }
  console.log("\nDefault admin roles are seeded.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
