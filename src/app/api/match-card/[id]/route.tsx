import { ImageResponse } from "next/og";
import { getShareableKundliMatch } from "@/lib/kundli-matching";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getShareableKundliMatch(id);
  if (!match) return new Response("Not found", { status: 404 });

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

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 40, color: "#d6ad91" }}>{match.nameA} &amp; {match.nameB}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ display: "flex", fontSize: 120, fontWeight: 700 }}>{match.score}</span>
            <span style={{ display: "flex", fontSize: 36, color: "#aa9d90" }}>/ {match.maxScore} guna points</span>
          </div>
          <div style={{ display: "flex", fontSize: 30 }}>{match.tierLabel}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#aa9d90" }}>
          <span style={{ display: "flex" }}>adijyotishguru.com</span>
          <span style={{ display: "flex" }}>Real Ashtakoot Guna Milan · Not a guess</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
