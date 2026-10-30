import { type IncomingMessage, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { TLSSocket } from "node:tls";
import { parseExpectStatus, statusMatches, type UptimeCheckInput, type UptimeHop, type UptimeResult } from "@wizeworks/lens-core/internal";
import { isCertError, probeCertEnd } from "./cert.js";
import { stallText, timeHop } from "./hop-timing.js";
import { checkLiteral, guardedLookup } from "./guard.js";

export interface RunOptions {
  /** Let checks reach private and local addresses (hubs: yes; the cloud: only when self-hosted with --allow-private-targets). */
  allowPrivate: boolean;
  now?: () => number;
  /** Extra trusted certificates, for tests. */
  ca?: string;
  /** Try a failed check once more before calling it down. Default true. */
  confirm?: boolean;
}

const MAX_REDIRECTS = 5;
const MAX_BODY = 1_000_000;
const USER_AGENT = "WizeLens-Uptime/1 (+https://wizelens.com/docs/uptime)";

interface Hop {
  status: number;
  location: string | null;
  body: string;
  tlsExpiresMs: number | null;
}

/** When the peer certificate ends, from an https response. */
function certEndOf(res: IncomingMessage): number | null {
  const socket = res.socket as TLSSocket;
  if (typeof socket.getPeerCertificate !== "function") return null;
  const end = Date.parse(socket.getPeerCertificate()?.valid_to ?? "");
  return Number.isFinite(end) ? end : null;
}

/** Read up to MAX_BODY characters of the body; past that, stop reading. */
function readBody(res: IncomingMessage, keep: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "";
    let size = 0;
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      if (keep) text += chunk;
      size += chunk.length;
      if (size > MAX_BODY) (res.destroy(), resolve(text.slice(0, MAX_BODY)));
    });
    res.on("end", () => resolve(text));
    res.on("error", reject);
  });
}

/** One request on a fresh connection, no redirects followed. Its phase times go on `hops` as it runs. */
function hop(url: URL, check: UptimeCheckInput, o: RunOptions, signal: AbortSignal, hops: UptimeHop[]): Promise<Hop> {
  checkLiteral(url, o.allowPrivate);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = { "user-agent": USER_AGENT, accept: "*/*", ...check.headers };
  return new Promise((resolve, reject) => {
    const req = send(url, { method: check.method, headers, signal, agent: false, lookup: guardedLookup(o.allowPrivate), ...(o.ca ? { ca: o.ca } : {}) }, (res) => {
      const tlsExpiresMs = certEndOf(res);
      readBody(res, check.expectBody !== "").then(
        (body) => resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null, body, tlsExpiresMs }),
        reject,
      );
    });
    hops.push(timeHop(req, url));
    req.on("error", reject);
    req.end();
  });
}

/** Redirects are followed unless the check expects a 3xx status itself. */
const followsRedirects = (check: UptimeCheckInput) => !(parseExpectStatus(check.expectStatus) ?? []).some(([lo, hi]) => lo < 400 && hi >= 300);

async function follow(check: UptimeCheckInput, o: RunOptions, signal: AbortSignal, hops: UptimeHop[]): Promise<Hop & { url: string; tls: number | null }> {
  let url = new URL(check.url);
  let tls: number | null = null;
  for (let i = 0; ; i++) {
    const h = await hop(url, check, o, signal, hops);
    tls ??= h.tlsExpiresMs;
    if (!followsRedirects(check) || h.status < 300 || h.status >= 400 || !h.location || i >= MAX_REDIRECTS) return { ...h, url: url.toString(), tls };
    url = new URL(h.location, url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ...h, url: url.toString(), tls };
  }
}

// A page whose text a script writes: an empty root element (React, Vue, Svelte, Next.js) and a script.
const SCRIPT_SHELL = /<div id="(root|app|__next|svelte)"[^>]*>\s*<\/div>/i;
const SHELL_HINT = ". This page builds its text with JavaScript, and a check reads only the HTML the server sends. Look for text in that HTML, such as the page title";

/** Why a response fails the check, or null when it passes. */
function verdict(check: UptimeCheckInput, h: Hop): string | null {
  if (!statusMatches(check.expectStatus, h.status)) return `Expected status ${check.expectStatus}, got ${h.status}`;
  if (!check.expectBody || h.body.includes(check.expectBody)) return null;
  const shell = SCRIPT_SHELL.test(h.body) && /<script/i.test(h.body);
  return `The response does not contain "${check.expectBody.slice(0, 80)}"${shell ? SHELL_HINT : ""}`;
}

const errorText = (err: unknown, timeoutMs: number): string => {
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) return `Timed out after ${timeoutMs / 1000} s`;
  const e = err as { message?: string; code?: string };
  return (e.message || e.code || "The request failed").slice(0, 300);
};

/** One try: follow redirects, time it and each hop, match status and body, and read the certificate's end. */
async function attempt(check: UptimeCheckInput, o: RunOptions): Promise<UptimeResult> {
  const now = o.now ?? Date.now;
  const startMs = now();
  const t0 = performance.now();
  const took = () => Math.max(0, Math.round((performance.now() - t0) * 10) / 10);
  const hops: UptimeHop[] = [];
  try {
    const h = await follow(check, o, AbortSignal.timeout(check.timeoutMs), hops);
    const error = verdict(check, h);
    return { startMs, durationMs: took(), ok: error === null, status: h.status, error, tlsExpiresMs: h.tls, finalUrl: h.url, hops };
  } catch (err) {
    const durationMs = took();
    const cert = isCertError(err);
    const tlsExpiresMs = cert ? await probeCertEnd(check.url, o.allowPrivate, check.timeoutMs) : null;
    const error = `${cert ? "The TLS certificate is not valid: " : ""}${errorText(err, check.timeoutMs)}${stallText(hops)}`;
    return { startMs, durationMs, ok: false, status: null, error, tlsExpiresMs, finalUrl: check.url, hops };
  }
}

/** Run one check. A failure is tried once more on a fresh connection, so a check is down only after two failures in a row. */
export async function runCheck(check: UptimeCheckInput, o: RunOptions): Promise<UptimeResult> {
  const first = await attempt(check, o);
  if (first.ok || o.confirm === false) return first;
  const again = await attempt(check, o);
  return { ...again, startMs: first.startMs, error: again.ok ? null : `${again.error} (failed twice in a row)` };
}
