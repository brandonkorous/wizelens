import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

const FONTS = join(process.cwd(), "node_modules/@fontsource/inter/files");

export const dynamic = "force-static";
export const alt = "WizeLens: see what matters";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BLADES =
  "M39.36 23.5L90.02 23.5A48 48 0 0 0 51.76 2.03ZM67.63 27.54L92.96 71.41A48 48 0 0 0 92.42 27.54ZM78.27 54.03L52.93 97.91A48 48 0 0 0 90.66 75.5ZM60.64 76.5L9.98 76.5A48 48 0 0 0 48.24 97.97ZM32.37 72.46L7.04 28.59A48 48 0 0 0 7.58 72.46ZM21.73 45.97L47.07 2.09A48 48 0 0 0 9.34 24.5Z";

// The link preview card: charcoal, the mark, and the brand line.
export default async function OpenGraphImage() {
  const [regular, bold] = await Promise.all([
    readFile(join(FONTS, "inter-latin-400-normal.woff")),
    readFile(join(FONTS, "inter-latin-700-normal.woff")),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#1f1f1f", color: "#f5f5f5", fontFamily: "Inter" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="88" height="88" viewBox="0 0 100 100">
            <path fill="#f5f5f5" d={BLADES} />
            <circle cx="50" cy="50" r="16.8" fill="#2563eb" />
          </svg>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>
            <span>Wize</span><span style={{ color: "#2563eb" }}>Lens</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>See what matters.</div>
          <div style={{ fontSize: 34, color: "#a3a9b3" }}>Every request, from the click to the SQL, across every service.</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
