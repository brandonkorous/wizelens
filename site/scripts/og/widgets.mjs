// Real product pieces drawn for share images: the HUD card, trace rows, and a code card.
import { tokenize } from "../../src/sections/install/highlight.ts";
import { C } from "./parts.mjs";
import { h } from "./render.mjs";

const box = (style, ...kids) => h("div", { style: { display: "flex", ...style } }, ...kids);

function stat(value, label, color) {
  return box({ flexDirection: "column" },
    box({ fontSize: 27, fontWeight: 700, color: color ?? C.nightFg, letterSpacing: -0.6, whiteSpace: "nowrap" }, value),
    box({ fontSize: 17, color: "#98a1ad", marginTop: 2 }, label));
}

export function hudCard() {
  const split = [[86, C.blue], [3, C.amber], [11, C.green]];
  return box({ flexDirection: "column", width: 444, padding: "26px 28px", borderRadius: 22, background: C.hud, border: `1px solid #2c3139`, color: C.nightFg },
    box({ alignItems: "center", gap: 12 },
      box({ width: 14, height: 14, borderRadius: 7, background: C.amber }),
      box({ fontSize: 22, fontWeight: 700 }, "WizeLens"),
      box({ fontSize: 17, color: "#98a1ad", flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }, "GET /api/customers-with-orders"),
      box({ fontSize: 17, fontWeight: 700, padding: "3px 10px", borderRadius: 7, background: "#15803d" }, "200")),
    box({ justifyContent: "space-between", marginTop: 24 }, stat("305 ms", "Total"), stat("263 ms", "Server"), stat("9.6 ms", "Database", C.amber), stat("35 ms", "Render")),
    box({ height: 10, borderRadius: 5, overflow: "hidden", marginTop: 20, background: C.hud2 },
      ...split.map(([w, c]) => box({ width: `${w}%`, height: 10, background: c }))),
    box({ gap: 22, marginTop: 18, fontSize: 18, fontWeight: 700, alignItems: "center" },
      box({}, "17 SQL"), box({}, "8 Fetch"), box({ alignItems: "center", gap: 8 }, "3 Insights", box({ width: 9, height: 9, borderRadius: 5, background: C.amber }))));
}

const KIND = { server: C.blue, db: C.amber, net: "#94a3b8", render: C.green, log: C.slate, msg: "#8b5cf6" };

// Trace rows: a label and a bar placed on the request's own time scale.
export function traceRows(rows, scale, width = 520, labelWidth = 210) {
  const track = width - labelWidth - 16;
  return box({ flexDirection: "column", gap: 12, width, padding: 26, borderRadius: 20, background: C.night2, border: `1px solid ${C.nightLine}` },
    ...rows.map((r) => box({ alignItems: "center", gap: 16 },
      box({ width: labelWidth, fontFamily: "Mono", fontSize: 16, color: C.nightFg, overflow: "hidden", whiteSpace: "nowrap" }, r.label.length > 19 ? `${r.label.slice(0, 18).trimEnd()}…` : r.label),
      box({ position: "relative", width: track, height: 16, borderRadius: 4, background: C.night3 },
        box({ position: "absolute", left: (r.start / scale) * track, top: 0, height: 16, width: Math.max(4, (r.dur / scale) * track), borderRadius: 4, background: KIND[r.kind] ?? C.blue })))));
}

const TOKEN = { kw: "#c792ea", str: "#a5d6a7", com: "#7c8594", fn: "#82aaff", type: "#ffcb6b", plain: C.nightFg };

// A dark code card with the same colors the site uses, cut to fit.
export function codeCard(code, file, width, maxLines = 6) {
  const lines = code.split("\n").slice(0, maxLines).map((l) => (l.length > 37 ? `${l.slice(0, 36)}…` : l));
  return box({ flexDirection: "column", width, borderRadius: 20, background: C.charcoal, overflow: "hidden" },
    file ? box({ padding: "14px 26px", fontFamily: "Mono", fontSize: 17, color: C.nightMuted, borderBottom: `1px solid ${C.nightLine}` }, file) : null,
    box({ flexDirection: "column", padding: "20px 26px", gap: 6 },
      ...lines.map((line) => box({ fontFamily: "Mono", fontSize: 21, minHeight: 28, whiteSpace: "pre" },
        ...tokenize(line).map((t) => h("span", { style: { color: TOKEN[t.kind] } }, t.text))))));
}
