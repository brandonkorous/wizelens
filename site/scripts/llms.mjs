// Writes llms.txt, llms-full.txt, and a Markdown copy of every docs page, so AI tools can read the site as plain text.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOC_GROUPS } from "../src/lib/docs/nav.ts";
import { FAQS } from "../src/sections/faq/faqs.ts";
import { readMd } from "./og/build-md.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_BASE = "https://wizelens.com";
const PUB = join(SITE, "public");

const SUMMARY = "WizeLens shows you everything one request did: the click in the browser (React, Vue, Angular, Svelte, or plain JS), every .NET, Node, Java, Python, and Go service it touched, every SQL query, every log line, and the render, on one timeline. It finds N+1 queries, N+1 HTTP calls, duplicate and slow queries, and errors for you. Open source (MIT), built on OpenTelemetry and W3C traceparent, on in development only, and readable by your own AI agent through an opt-in, read-only MCP endpoint. Made by WizeWorks LLC, Visalia, California.";

const PAGES = [
  ["Home", "/", "What WizeLens is and how one click becomes one trace."],
  ["WizeLens for ASP.NET Core", "/dotnet/", "Two lines in Program.cs; EF Core, ADO.NET, HttpClient, gRPC, messaging, logs, metrics."],
  ["WizeLens for Node", "/node/", "Express, Fastify, Koa, Hono, Next.js; one line per driver, queue, or logger."],
  ["WizeLens for React and Next.js", "/react/", "Fetch linked to server traces, render timing, Web Vitals, the HUD."],
  ["WizeLens for Vue", "/vue/", "One plugin: fetch and XHR linked to server traces, router page views, Web Vitals, component errors."],
  ["WizeLens for Angular", "/angular/", "An ErrorHandler and a router tracker: HttpClient calls linked to server traces, page views, Web Vitals."],
  ["WizeLens for Svelte and SvelteKit", "/svelte/", "The first load joins the server trace; page views, Web Vitals, and errors with their route."],
  ["WizeLens for Java", "/java/", "The OpenTelemetry Java agent with no code change; the WizeLens extension adds SQL parameters and sampling that keeps errors."],
  ["WizeLens for Python", "/python/", "opentelemetry-instrument for FastAPI, Flask, and Django; the wizelens distro adds SQL parameters, logs, and sampling."],
  ["WizeLens for Go", "/go/", "One module over the OpenTelemetry SDK: net/http, database/sql with parameters, outgoing calls, and slog."],
  ["WizeLens Cloud", "/cloud/", "Team dashboard, hosted at app.wizelens.com or self-hosted: roles, history, alerts, share links, and AI access by sign-in or read key."],
  ["Pricing", "/pricing/", "WizeLens Cloud plans: Free (10 GB, 14 days), Team $29 (50 GB, 30 days), Business $99 (150 GB, 90 days, SSO, SCIM), Enterprise custom. Unlimited users and MCP on every plan; free forever to self-host."],
  ["Glimpse, rebuilt", "/story/", "Why WizeLens exists: the spirit of Glimpse for apps split into services."],
  ["Changelog", "/changelog/", "Every release, newest first."],
];

function docSource(slug) {
  if (slug === "contract") return { meta: { title: "Wire contract", description: "The wire format every add-on, the hub, and the cloud follow." }, body: readFileSync(join(SITE, "..", "docs", "CONTRACT.md"), "utf8").replace(/^# .*\r?\n/, "") };
  return readMd(join(SITE, "content", "docs", `${slug || "index"}.md`));
}

function asMarkdown(slug) {
  const { meta, body } = docSource(slug);
  const url = `${URL_BASE}${slug ? `/docs/${slug}/` : "/docs/"}`;
  return `# ${meta.title}\n\n> ${meta.description}\n\nSource: ${url}\n\n${body.replace(/\]\(\//g, `](${URL_BASE}/`).trim()}\n`;
}

function llmsTxt() {
  const docs = DOC_GROUPS.map((g) => `## Docs: ${g.title}\n\n${g.items.map((d) => {
    const { meta } = docSource(d.slug);
    return `- [${meta.title}](${URL_BASE}/docs/${d.slug || "index"}.md): ${meta.description}`;
  }).join("\n")}`).join("\n\n");
  const pages = PAGES.map(([n, p, d]) => `- [${n}](${URL_BASE}${p}): ${d}`).join("\n");
  return `# WizeLens\n\n> ${SUMMARY}\n\n${docs}\n\n## Pages\n\n${pages}\n\n## Optional\n\n- [Everything in one file](${URL_BASE}/llms-full.txt): every docs page and the FAQ as Markdown.\n- [Source code](https://github.com/brandonkorous/wizelens): MIT licensed.\n`;
}

function llmsFull() {
  const faq = FAQS.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n");
  const docs = DOC_GROUPS.flatMap((g) => g.items).map((d) => asMarkdown(d.slug)).join("\n---\n\n");
  return `# WizeLens\n\n> ${SUMMARY}\n\n## Questions\n\n${faq}\n\n---\n\n${docs}`;
}

mkdirSync(join(PUB, "docs"), { recursive: true });
for (const d of DOC_GROUPS.flatMap((g) => g.items)) writeFileSync(join(PUB, "docs", `${d.slug || "index"}.md`), asMarkdown(d.slug));
writeFileSync(join(PUB, "llms.txt"), llmsTxt());
writeFileSync(join(PUB, "llms-full.txt"), llmsFull());
console.log("llms: llms.txt, llms-full.txt, and Markdown for every docs page");
