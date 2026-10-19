#!/usr/bin/env node
// Load test (docs/SEARCH-PLAN.md, section 10; run the cloud with a high --ingest-per-minute): node scripts/load-test.mjs <cloud url> <setup token> [--rate 2000] [--seconds 60] [--days 30]
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { batch } from "./load/data.mjs";
import { line, PAGES, percentile, SEARCHES, time } from "./load/measure.mjs";

const { positionals, values: o } = parseArgs({
  allowPositionals: true,
  options: { rate: { type: "string", default: "2000" }, seconds: { type: "string", default: "60" }, days: { type: "string", default: "30" }, batch: { type: "string", default: "100" }, workers: { type: "string", default: "8" }, repeat: { type: "string", default: "10" } },
});
const base = (positionals[0] ?? "http://localhost:5970").replace(/\/+$/, "");
const setupToken = positionals[1] ?? process.env.WIZELENS_CLOUD_SETUP_TOKEN ?? "";
const [rate, seconds, days, size, workers, repeat] = [o.rate, o.seconds, o.days, o.batch, o.workers, o.repeat].map(Number);
let cookie = "";

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${base}/_wizelens/${path}`, { method, headers: { "Content-Type": "application/json", "X-WizeLens-Client": "dashboard", Origin: base, Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (set.length) cookie = [cookie, ...set].filter(Boolean).join("; ");
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : undefined;
}

/** The first account (made on the first run, signed in after), its project, and an ingest key. */
async function setup() {
  const account = { email: "load@load.test", password: `load-${setupToken}-password`, name: "Load" };
  await call("POST", "api/auth/sign-up/email", account, { "x-wizelens-setup-token": setupToken }).catch(() => call("POST", "api/auth/sign-in/email", account));
  const me = await call("GET", "api/me");
  const [orgId, projectId] = [me.orgs[0].id, me.orgs[0].projects[0].id];
  const key = (await call("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", name: `load ${Date.now()}`, projectIds: [projectId] })).token;
  return { projectId, key };
}

/** One worker: a batch at a time, paced to its share of the rate. Returns traces sent, failures, and call times. */
async function worker(key, until) {
  const gapMs = (size * workers * 1000) / rate;
  const out = { sent: 0, failed: 0, ms: [] };
  while (Date.now() < until) {
    const t0 = performance.now();
    const res = await fetch(`${base}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: batch(size, days) }).catch(() => null);
    const took = performance.now() - t0;
    out.ms.push(took);
    if (res?.status === 204) out.sent += size;
    else out.failed += size;
    await res?.arrayBuffer().catch(() => undefined);
    if (took < gapMs) await new Promise((r) => setTimeout(r, gapMs - took));
  }
  return out;
}

async function ingest(key) {
  console.log(`Ingest: ${rate} traces/s target, ${seconds} s, ${workers} workers, ${size} traces a call, spread over ${days} days.`);
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: workers }, () => worker(key, t0 + seconds * 1000)));
  const elapsed = (Date.now() - t0) / 1000;
  const sent = parts.reduce((n, p) => n + p.sent, 0);
  const failed = parts.reduce((n, p) => n + p.failed, 0);
  const ms = parts.flatMap((p) => p.ms);
  const got = sent / elapsed;
  console.log(`${got >= rate * 0.95 ? "ok  " : "SLOW"} ingest: ${got.toFixed(0)} traces/s (${sent} traces, ${sent * 5} spans, ${failed} failed); call p95 ${percentile(ms, 0.95).toFixed(0)} ms`);
  return sent;
}

/** Wait until the cloud has indexed every trace. */
async function settled(projectId) {
  const t0 = Date.now();
  for (;;) {
    const page = await call("GET", `api/search?project=${projectId}&kind=traces&range=30d&limit=1`);
    if (!page.settling) return console.log(`Indexed everything ${((Date.now() - t0) / 1000).toFixed(0)} s after the last call.`);
    process.stdout.write(`\r  still indexing: ${page.settling} traces   `);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

async function queries(projectId) {
  console.log(`Searches over 30 days (target 300 ms) and pages (target 100 ms), ${repeat} runs each:`);
  for (const [kind, q] of SEARCHES) {
    const url = `api/search?project=${projectId}&kind=${kind}&range=30d&limit=50&q=${encodeURIComponent(q)}`;
    console.log(line(`search ${kind} ${q || "(all)"}`, await time(() => call("GET", url), repeat), 300));
  }
  for (const page of PAGES) {
    let n = 0;
    // A new parameter each run, so the cloud's one-minute page cache never answers.
    const run = () => call("GET", `api/models/${page}&project=${projectId}&load=${n++}`);
    console.log(line(`page ${page}`, await time(run, repeat), 100));
  }
}

const { projectId, key } = await setup();
if (seconds > 0) await ingest(key);
await settled(projectId);
await queries(projectId);
