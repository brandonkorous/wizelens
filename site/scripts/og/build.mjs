// Makes every share image and app icon into public/, before the site builds.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC_LIST } from "../../src/lib/docs/nav.ts";
import { DOTNET } from "../../src/sections/stacks/data/dotnet.ts";
import { NODE } from "../../src/sections/stacks/data/node.ts";
import { REACT } from "../../src/sections/stacks/data/react.ts";
import { readMd } from "./build-md.mjs";
import { BLADES } from "./parts.mjs";
import { svgToPng, toPng } from "./render.mjs";
import * as T from "./templates.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(SITE, "public", "og");

function firstCode(body) {
  const m = /```(\w*)\r?\n([\s\S]*?)```/.exec(body);
  if (!m || m[1] === "bash" || m[1] === "text") return /```(?:csharp|ts|tsx|js|json)\r?\n([\s\S]*?)```/.exec(body)?.[1]?.trimEnd() ?? null;
  return m[2].trimEnd();
}

const CODE_FILE = { "aspnet-core": "Program.cs", node: "server.ts", nextjs: "instrumentation.ts", react: "main.tsx", "quick-start": "Program.cs", "ai-access": "Program.cs" };

function docImages() {
  return DOC_LIST.filter((d) => d.slug !== "contract").map((d) => {
    const { meta, body } = readMd(join(SITE, "content", "docs", `${d.slug || "index"}.md`));
    const path = d.slug ? `/docs/${d.slug}/` : "/docs/";
    const code = d.slug ? firstCode(body) : null;
    return { name: d.slug ? `docs-${d.slug}` : "docs", el: () => T.doc({ title: d.slug ? meta.title : "WizeLens Docs", description: meta.description, path, code, file: CODE_FILE[d.slug] }) };
  });
}

function releases() {
  const raw = readFileSync(join(SITE, "..", "CHANGELOG.md"), "utf8");
  return [...raw.matchAll(/^## \[([^\]]+)\]\s*(?:[—-]\s*(.*))?$/gm)].map((m) => ({ version: m[1], title: m[2] ?? "" }));
}

function legalImages() {
  return ["privacy", "terms", "security", "license"].map((slug) => {
    const { meta } = readMd(join(SITE, "content", "legal", `${slug}.md`));
    return { name: slug, el: () => T.doc({ title: meta.title, description: meta.description, path: `/${slug}/`, suffix: null }) };
  });
}

const IMAGES = [
  { name: "home", el: T.home },
  ...[DOTNET, NODE, REACT].map((s) => ({ name: s.slug, el: () => T.stack(s) })),
  { name: "story", el: T.story },
  { name: "changelog", el: () => T.changelog(releases()) },
  { name: "cloud", el: T.cloud },
  { name: "docs-contract", el: () => T.doc({ title: "Wire contract", description: "The wire format every WizeLens add-on, the hub, and the cloud follow.", path: "/docs/contract/", code: null }) },
  ...docImages(),
  ...legalImages(),
];

async function icons() {
  const brand = join(SITE, "public", "brand");
  mkdirSync(brand, { recursive: true });
  const markSvg = (bg, pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${100 + pad * 2} ${100 + pad * 2}">${bg ? `<rect x="${-pad}" y="${-pad}" width="${100 + pad * 2}" height="${100 + pad * 2}" fill="${bg}"/>` : ""}<path fill="#1F1F1F" d="${BLADES}"/><circle cx="50" cy="50" r="16.8" fill="#2563EB"/></svg>`;
  writeFileSync(join(brand, "wizelens-mark-512.png"), await svgToPng(markSvg(null, 0), 512));
  writeFileSync(join(SITE, "public", "apple-touch-icon.png"), await svgToPng(markSvg("#ffffff", 18), 180));
  writeFileSync(join(brand, "icon-192.png"), await svgToPng(markSvg("#ffffff", 18), 192));
  writeFileSync(join(brand, "icon-512.png"), await svgToPng(markSvg("#ffffff", 18), 512));
}

mkdirSync(OUT, { recursive: true });
for (const img of IMAGES) writeFileSync(join(OUT, `${img.name}.png`), await toPng(img.el()));
await icons();
console.log(`og: ${IMAGES.length} share images and 4 icons`);
