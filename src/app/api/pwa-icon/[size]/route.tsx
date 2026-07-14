import { ImageResponse } from "next/og";

const SUPPORTED_SIZES = new Set([180, 192, 512]);

export const runtime = "edge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: rawSize } = await params;
  const size = Number(rawSize);

  if (!SUPPORTED_SIZES.has(size)) {
    return new Response("Icon size not found", { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: "#0f172a",
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "64%",
            height: "64%",
            border: `${Math.max(3, Math.round(size * 0.018))}px solid rgba(255,255,255,0.16)`,
            borderRadius: "22%",
            background: "#18233a",
            fontSize: Math.round(size * 0.42),
            fontWeight: 800,
          }}
        >
          A
        </div>
        <div
          style={{
            position: "absolute",
            right: "17%",
            bottom: "17%",
            width: "13%",
            height: "13%",
            borderRadius: "50%",
            background: "#10b981",
            border: `${Math.max(3, Math.round(size * 0.014))}px solid #0f172a`,
          }}
        />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
