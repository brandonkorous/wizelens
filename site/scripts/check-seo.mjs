// Checks the built site (out/) for SEO basics on every page. Exits 1 when something is wrong.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const BASE = "https://wizelens.com";

function htmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const pick = (h, re) => (h.match(re) ?? [])[1];

function checkPage(file, seen, sitemap) {
  const issues = [];
  const h = readFileSync(file, "utf8");
  const page = `/${relative(OUT, file).split(sep).join("/").replace(/index\.html$/, "")}`;
  const title = pick(h, /<title>(.*?)<\/title>/);
  const desc = pick(h, /name="description" content="([^"]*)/);
  const canon = pick(h, /rel="canonical" href="([^"]+)/);
  const og = pick(h, /property="og:image" content="([^"]+)/);
  const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!title || title.length > 70) issues.push(`title ${title?.length ?? "missing"}: ${title}`);
  if (!desc || desc.length < 70 || desc.length > 165) issues.push(`description ${desc?.length ?? "missing"} chars`);
  for (const [kind, v] of [["title", title], ["description", desc]]) {
    if (seen.has(`${kind}:${v}`)) issues.push(`duplicate ${kind}`);
    seen.add(`${kind}:${v}`);
  }
  if (canon !== `${BASE}${page}`) issues.push(`canonical ${canon}`);
  if (!og || !existsSync(join(OUT, new URL(og).pathname))) issues.push(`og:image ${og}`);
  if ((h.match(/<h1[\s>]/g) ?? []).length !== 1) issues.push("not exactly one h1");
  for (const l of lds) { try { JSON.parse(l); } catch { issues.push("bad JSON-LD"); } }
  if (lds.length < 2) issues.push(`${lds.length} JSON-LD blocks`);
  if ([...h.matchAll(/<img [^>]*>/g)].some((m) => !/alt="[^"]+"/.test(m[0]))) issues.push("image without alt");
  if (!sitemap.includes(`<loc>${BASE}${page}</loc>`)) issues.push("not in sitemap");
  return issues.map((i) => `${page}  ${i}`);
}

const sitemap = readFileSync(join(OUT, "sitemap.xml"), "utf8");
const seen = new Set();
const pages = htmlFiles(OUT).filter((f) => !/(^|[\\/])(404|_not-found)/.test(relative(OUT, f)));
const problems = pages.flatMap((f) => checkPage(f, seen, sitemap));
for (const p of problems) console.log(p);
console.log(`check-seo: ${pages.length} pages, ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
