import { ImageResponse } from "next/og";
import { getCosmicProfileCard } from "@/lib/cosmic-profile-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getCosmicProfileCard(id);
  if (!card) return new Response("Not found", { status: 404 });

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
          <div style={{ display: "flex", fontSize: 52, fontWeight: 700 }}>{card.name} — Cosmic Profile</div>
          <div style={{ display: "flex", gap: 34, fontSize: 28, color: "#d6ad91" }}>
            <span style={{ display: "flex" }}>Sun · {card.sunRashi}</span>
            <span style={{ display: "flex" }}>Moon · {card.moonRashi}</span>
            <span style={{ display: "flex" }}>Rising · {card.risingRashi}</span>
          </div>
          <div style={{ display: "flex", fontSize: 30, maxWidth: 940, lineHeight: 1.4 }}>&#8220;{card.blurb}&#8221;</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#aa9d90" }}>
          <span style={{ display: "flex" }}>astronomers.in</span>
          <span style={{ display: "flex" }}>Real Vedic chart · Not AI</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
