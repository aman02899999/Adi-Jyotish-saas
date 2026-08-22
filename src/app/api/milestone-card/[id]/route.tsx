import { ImageResponse } from "next/og";
import { getMilestone } from "@/lib/milestones";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const milestone = await getMilestone(id);
  if (!milestone) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%", width: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: "64px",
          background: "linear-gradient(135deg, #171009 0%, #221708 60%, #3a2313 100%)",
          color: "#f6ead7",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, color: "#b98d54", textTransform: "uppercase" }}>
          Adi Jyotish Guru
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 78, fontWeight: 700 }}>{milestone.value.toLocaleString("en-IN")}</div>
          <div style={{ display: "flex", fontSize: 34, maxWidth: 940, lineHeight: 1.4, color: "#d6ad91" }}>
            Real consultations delivered by our verified astrologers.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#aa9d90" }}>
          <span style={{ display: "flex" }}>astronomers.in</span>
          <span style={{ display: "flex" }}>Milestone reached {milestone.achievedAt.toLocaleDateString("en", { month: "long", year: "numeric" })}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
