// Shared pieces of every share image: colors, the mark, the lockup, the frame, and the footer line.
import { h } from "./render.mjs";

export const C = {
  charcoal: "#1f1f1f", white: "#ffffff", paper: "#f6f7f9", blue: "#2563eb", green: "#22c55e", amber: "#f4b400",
  orange: "#f97316", red: "#e63946", slate: "#64748b", line: "#e5e8ee", night2: "#282828", night3: "#323232",
  nightLine: "#3a3a3a", nightFg: "#f5f5f5", nightMuted: "#a3a9b3", fg2: "#3d4350", hud: "#171a1f", hud2: "#1e2228",
};

export const BLADES = "M39.36 23.5L90.02 23.5A48 48 0 0 0 51.76 2.03ZM67.63 27.54L92.96 71.41A48 48 0 0 0 92.42 27.54ZM78.27 54.03L52.93 97.91A48 48 0 0 0 90.66 75.5ZM60.64 76.5L9.98 76.5A48 48 0 0 0 48.24 97.97ZM32.37 72.46L7.04 28.59A48 48 0 0 0 7.58 72.46ZM21.73 45.97L47.07 2.09A48 48 0 0 0 9.34 24.5Z";

export function mark(size, blades, lens = C.blue) {
  return h("svg", { width: size, height: size, viewBox: "0 0 100 100" },
    h("path", { d: BLADES, fill: blades }),
    h("circle", { cx: 50, cy: 50, r: 16.8, fill: lens }));
}

export function lockup(dark, suffix) {
  const fg = dark ? C.nightFg : C.charcoal;
  return h("div", { style: { display: "flex", alignItems: "center", gap: 14 } },
    mark(44, fg),
    h("div", { style: { display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: -1.2, color: fg } },
      h("span", null, "Wize"), h("span", { style: { color: C.blue } }, "Lens"),
      suffix ? h("span", { style: { marginLeft: 12, fontWeight: 400, color: dark ? C.nightMuted : C.slate } }, suffix) : null));
}

// The brand's color meaning, as a row of status dots.
export function healthDots() {
  return h("div", { style: { display: "flex", gap: 8 } },
    ...[C.blue, C.green, C.amber, C.orange, C.red, C.slate].map((c) => h("div", { style: { width: 12, height: 12, borderRadius: 6, background: c } })));
}

export function frame({ dark, path, suffix, children }) {
  // Satori adds padding outside the size, so the box is the image size minus the padding.
  return h("div", {
    style: {
      width: 1056, height: 510, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 72px",
      background: dark ? C.charcoal : C.paper, color: dark ? C.nightFg : C.charcoal, fontFamily: "Inter",
    },
  },
    lockup(dark, suffix),
    h("div", { style: { display: "flex", flex: 1, alignItems: "center" } }, children),
    h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
      h("div", { style: { fontFamily: "Mono", fontSize: 20, color: dark ? C.nightMuted : C.slate } }, `wizelens.com${path}`),
      healthDots()));
}

export function title(text, size, dark, width) {
  return h("div", { style: { display: "flex", fontSize: size, fontWeight: 700, letterSpacing: -size * 0.045, lineHeight: 1, color: dark ? C.nightFg : C.charcoal, width } }, text);
}

export function sub(text, dark, width, size = 28) {
  return h("div", { style: { display: "flex", fontSize: size, lineHeight: 1.35, color: dark ? C.nightMuted : C.fg2, width, marginTop: 24 } }, text);
}
