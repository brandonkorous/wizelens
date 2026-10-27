// Builds the rating rows for WizeLens from the code. Usage: node gen-screens.mjs <repo root>
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const read = (p) => readFileSync(join(root, p), "utf8");
const rows = [];
const add = (group, screen, key) => rows.push({ group, screen, key });

// Nav pages, per host. In-app has "federation", "search", "tags" (+ "metrics" when on); cloud has everything but "settings".
const nav = read("js/packages/ui/src/shell/nav.ts").split("\n").filter((l) => l.trim().startsWith("{ page:")).map((l) => [l, l.match(/page: "([a-z]+)"/)[1], l.match(/label: "([^"]+)"/)[1], l.match(/needs: "([a-z]+)"/)?.[1]]);
const inApp = new Set(["federation", "search", "tags", "metrics"]);
for (const [, page, label, needs] of nav) {
  if (!needs || inApp.has(needs)) if (page !== "people" && page !== "organization") add("Dashboard · in-app (/_wizelens)", label, `#/${page === "overview" ? "" : page}`);
}
for (const [, page, label] of nav) if (page !== "settings") add("Dashboard · cloud", label, `#/${page === "overview" ? "" : page}`);

// Sections of the multi-section pages, from their section lists.
const sections = (file) => [...read(file).matchAll(/id: "([a-z-]+)", label: ([^,]+),/g)].map((m) => [m[1], m[2].replace(/^"|"$/g, "")]);
const label = (raw, id) => (raw.includes("(") || raw.includes("?") ? id : raw);
for (const [id, raw] of sections("js/packages/ui/src/pages/connect/ConnectPage.tsx")) {
  add("Dashboard · in-app (/_wizelens)", `Connect › ${label(raw, id)}`, `#/connect/${id}`);
  add("Dashboard · cloud", `Connect › ${label(raw, id)}`, `#/connect/${id}`);
}
const org = read("js/packages/ui/src/pages/organization/OrgPage.tsx").split("\n");
const cloudOrg = org.slice(0, 30).join("\n"), localOrg = org.slice(30).join("\n");
for (const m of cloudOrg.matchAll(/id: "([a-z-]+)", label: "([^"]+)"/g)) add("Dashboard · cloud", `Organization › ${m[2]}`, `#/organization/${m[1]}`);
for (const m of localOrg.matchAll(/id: "([a-z-]+)", label: "([^"]+)"/g)) add("Dashboard · in-app (/_wizelens)", `Settings › ${m[2]}`, `#/settings/${m[1]}`);
for (const m of read("js/packages/ui/src/pages/people/PeoplePage.tsx").matchAll(/id: "([a-z-]+)", label: "([^"]+)"/g)) add("Dashboard · cloud", `People & access › ${m[2]}`, `#/people/${m[1]}`);
for (const m of read("js/packages/ui/src/pages/account/AccountPage.tsx").matchAll(/id: "([a-z-]+)", label: "([^"]+)"/g)) add("Dashboard · cloud", `Account › ${m[2]}`, `#/account/${m[1]}`);
add("Dashboard · cloud", "Account › Security", "#/account/security");

for (const g of ["Dashboard · in-app (/_wizelens)", "Dashboard · cloud"]) add(g, "Connect › options", "#/connect/options");

// Detail screens (routes.ts helpers), both hosts.
const details = [
  ["Trace › Timeline", "#/traces/<id>"], ["Trace › SQL", "#/traces/<id>/sql"], ["Trace › HTTP", "#/traces/<id>/http"],
  ["Trace › Messages", "#/traces/<id>/messages"], ["Trace › Logs", "#/traces/<id>/logs"], ["Trace › Errors", "#/traces/<id>/errors"],
  ["Trace compare", "#/traces/<a>/compare/<b>"], ["Error group", "#/errors/<group>"], ["Service endpoint", "#/services/<svc>/endpoints/<ep>"],
  ["Query shape", "#/database/queries/<sql>"], ["Page route", "#/rendering/routes/<route>"], ["User", "#/users/<user>"],
];
for (const [s, k] of details) { add("Dashboard · in-app (/_wizelens)", s, k); add("Dashboard · cloud", s, k); }
for (const [s, k] of [["Alert rule", "#/alerts/<id>"], ["SLO", "#/slos/<id>"], ["Dashboard", "#/dashboards/<id>"], ["Shared page (signed out)", "#/shared/<token>"], ["Status page", "#/status/<slug>"]]) add("Dashboard · cloud", s, k);

// Account screens on the cloud (AUTH_PAGES plus the sign-in screens themselves).
for (const s of ["Sign in", "Create account", "No organization yet"]) add("Cloud · account screens", s, "(signed out)");
const auth = read("js/packages/ui/src/routes.ts").match(/AUTH_PAGES: readonly AuthPageId\[\] = \[([^\]]+)\]/)[1].match(/"([a-z-]+)"/g).map((s) => s.slice(1, -1));
for (const a of auth) add("Cloud · account screens", a, `#/${a}`);

// The in-page HUD.
add("HUD (in the app's own page)", "HUD card", "bottom corner of the app");
add("HUD (in the app's own page)", "HUD details panel", "HUD › details");

// Marketing site: app folders and docs pages.
const app = join(root, "site/src/app");
add("Site · wizelens.com", "Home", "/");
for (const d of readdirSync(app)) if (statSync(join(app, d)).isDirectory() && d !== "docs") add("Site · wizelens.com", d, `/${d}`);
add("Site · wizelens.com", "Docs home", "/docs");
for (const f of readdirSync(join(root, "site/content/docs"))) if (f !== "index.md") add("Site · docs", f.replace(/\.md$/, ""), `/docs/${f.replace(/\.md$/, "")}`);

const order = [...new Set(rows.map((r) => r.group))].sort((a, b) => (a.includes("in-app") ? 0 : a.includes("Dashboard · cloud") ? 1 : 2) - (b.includes("in-app") ? 0 : b.includes("Dashboard · cloud") ? 1 : 2));
rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
let out = "", group = "";
for (const r of rows) {
  if (r.group !== group) { group = r.group; out += `\n### ${group} — ${rows.filter((x) => x.group === group).length} screens\n\n| Screen | Key | Design | Ease | Gap to 10 | Persona |\n| --- | --- | --- | --- | --- | --- |\n`; }
  out += `| ${r.screen} | \`${r.key}\` | — | — | — | — |\n`;
}
console.log(`ROWS=${rows.length}`);
console.log(out);
