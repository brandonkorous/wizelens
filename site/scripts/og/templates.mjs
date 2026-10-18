// One layout per kind of page. Each mixes the brand type with a real piece of the product.
import { C, frame, sub, title } from "./parts.mjs";
import { h } from "./render.mjs";
import { codeCard, hudCard, traceRows } from "./widgets.mjs";

const box = (style, ...kids) => h("div", { style: { display: "flex", ...style } }, ...kids);

export function home() {
  return frame({ dark: false, path: "", children: box({ width: "100%", justifyContent: "space-between", alignItems: "center" },
    box({ flexDirection: "column", width: 540 },
      title("See what matters.", 104, false, 540),
      sub("Every request, from the click in React to the SQL, across every service.", false, 500)),
    hudCard()) });
}

export function stack(s) {
  return frame({ dark: true, path: `/${s.slug}/`, children: box({ width: "100%", justifyContent: "space-between", alignItems: "center" },
    box({ flexDirection: "column", width: 500 }, title(`${s.headline[0]} ${s.headline[1]}`, 64, true, 500), sub(s.facts.map((f) => `${f.value} ${f.label}`).slice(0, 2).join(" · "), true, 500, 24)),
    traceRows(s.rows.slice(0, 6), s.scale, 470, 200)) });
}

export function doc({ title: t, description, path, code, file, suffix = "Docs" }) {
  const big = t.length > 22 ? 70 : 88;
  const left = box({ flexDirection: "column", width: code ? 500 : 960 }, title(t, big, false, code ? 500 : 960), sub(description, false, code ? 480 : 900, 26));
  return frame({ dark: false, path, suffix, children: box({ width: "100%", justifyContent: "space-between", alignItems: "center" }, left, code ? codeCard(code, file, 520, 7) : null) });
}

export function story() {
  const rows = [
    { label: "React app", start: 0, dur: 305, kind: "net" }, { label: "gateway", start: 4, dur: 270, kind: "server" },
    { label: "orders", start: 40, dur: 60, kind: "server" }, { label: "SQL", start: 50, dur: 30, kind: "db" },
    { label: "queue", start: 120, dur: 8, kind: "msg" }, { label: "billing", start: 130, dur: 90, kind: "server" },
  ];
  return frame({ dark: true, path: "/story/", children: box({ width: "100%", justifyContent: "space-between", alignItems: "center" },
    box({ flexDirection: "column", width: 500 }, title("Glimpse, rebuilt.", 96, true, 500), sub("The bar at the bottom of the page, back for how we build today.", true, 470, 26)),
    traceRows(rows, 310, 490, 140)) });
}

export function changelog(releases) {
  const chip = (r, i) => box({ alignItems: "center", gap: 16, padding: "18px 24px", borderRadius: 16, background: C.white, border: `1px solid ${C.line}` },
    box({ width: 14, height: 14, borderRadius: 7, background: i === 0 ? C.green : C.blue }),
    box({ fontFamily: "Mono", fontSize: 23, fontWeight: 700, width: 230, whiteSpace: "nowrap" }, r.version),
    box({ fontSize: 20, color: C.fg2, whiteSpace: "nowrap" }, r.title || "on main now"));
  return frame({ dark: false, path: "/changelog/", children: box({ width: "100%", justifyContent: "space-between", alignItems: "center" },
    box({ flexDirection: "column", width: 430 }, title("Changelog.", 80, false, 430), sub("Every change, newest first.", false, 400, 26)),
    box({ flexDirection: "column", gap: 12, width: 520 }, ...releases.slice(0, 4).map(chip))) });
}

export function cloud() {
  const role = (r, c) => box({ alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 999, background: C.night2, fontSize: 20 }, box({ width: 30, height: 30, borderRadius: 15, background: c }), r);
  return frame({ dark: true, path: "/cloud/", children: box({ width: "100%", justifyContent: "space-between", alignItems: "center" },
    box({ flexDirection: "column", width: 520 }, title("The same lens, for the team.", 84, true, 520), sub("Roles, 30 days of history, alerts, and share links. Self-hosted on Postgres.", true, 500, 24)),
    box({ flexDirection: "column", gap: 16, width: 470 },
      box({ alignItems: "center", gap: 14, padding: "20px 24px", borderRadius: 18, background: C.white, color: C.charcoal },
        box({ width: 14, height: 14, borderRadius: 7, background: C.red }),
        box({ flexDirection: "column" }, box({ fontSize: 23, fontWeight: 700 }, "Error rate is 3.4% (above 2%)"), box({ fontSize: 18, color: C.slate, marginTop: 4 }, "orders-api · production · sent to Slack"))),
      box({ flexWrap: "wrap", gap: 10 }, role("Owner", C.nightFg), role("Admin", C.blue), role("Member", "#0b7a68"), role("Viewer", C.slate)))) });
}
