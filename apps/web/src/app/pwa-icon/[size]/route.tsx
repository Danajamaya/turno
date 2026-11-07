import { ImageResponse } from "next/og";

// App icons drawn on the fly: navy tile, gold sun, white "t". Same look as the sidebar logo.
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = (await params).size === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #14224a, #2c4a8a)", position: "relative" }}>
        <div style={{ position: "absolute", top: size * 0.16, right: size * 0.16, width: size * 0.26, height: size * 0.26, borderRadius: size, background: "#f2a91f" }} />
        <div style={{ fontSize: size * 0.62, fontWeight: 700, color: "#ffffff", fontFamily: "serif", marginTop: size * 0.04 }}>t</div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
