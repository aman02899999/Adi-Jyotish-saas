import { db } from "@/lib/firestore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.collection("studioSettings").doc("main").get();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
