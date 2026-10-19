import { type IncomingMessage, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { TLSSocket } from "node:tls";
import { parseExpectStatus, statusMatches, type UptimeCheckInput, type UptimeResult } from "@wizeworks/lens-core";
import { isCertError, probeCertEnd } from "./cert.js";
import { checkLiteral, guardedLookup } from "./guard.js";

export interface RunOptions {
  /** Let checks reach private and local addresses (hubs: yes; the cloud: only when self-hosted with --allow-private-webhooks). */
  allowPrivate: boolean;
  now?: () => number;
  /** Extra trusted certificates, for tests. */
  ca?: string;
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

/** One request, no redirects followed. */
function hop(url: URL, check: UptimeCheckInput, o: RunOptions, signal: AbortSignal): Promise<Hop> {
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
    req.on("error", reject);
    req.end();
  });
}

/** Redirects are followed unless the check expects a 3xx status itself. */
const followsRedirects = (check: UptimeCheckInput) => !(parseExpectStatus(check.expectStatus) ?? []).some(([lo, hi]) => lo < 400 && hi >= 300);

async function follow(check: UptimeCheckInput, o: RunOptions, signal: AbortSignal): Promise<Hop & { url: string; tls: number | null }> {
  let url = new URL(check.url);
  let tls: number | null = null;
  for (let i = 0; ; i++) {
    const h = await hop(url, check, o, signal);
    tls ??= h.tlsExpiresMs;
    if (!followsRedirects(check) || h.status < 300 || h.status >= 400 || !h.location || i >= MAX_REDIRECTS) return { ...h, url: url.toString(), tls };
    url = new URL(h.location, url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ...h, url: url.toString(), tls };
  }
}

/** Why a response fails the check, or null when it passes. */
function verdict(check: UptimeCheckInput, h: Hop): string | null {
  if (!statusMatches(check.expectStatus, h.status)) return `Expected status ${check.expectStatus}, got ${h.status}`;
  if (check.expectBody && !h.body.includes(check.expectBody)) return `The response does not contain "${check.expectBody.slice(0, 80)}"`;
  return null;
}

const errorText = (err: unknown, timeoutMs: number): string => {
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) return `Timed out after ${timeoutMs / 1000} s`;
  const e = err as { message?: string; code?: string };
  return (e.message || e.code || "The request failed").slice(0, 300);
};

/** Run one check: follow redirects, time it, match status and body, and read the certificate's end. */
export async function runCheck(check: UptimeCheckInput, o: RunOptions): Promise<UptimeResult> {
  const now = o.now ?? Date.now;
  const startMs = now();
  const t0 = performance.now();
  const took = () => Math.max(0, Math.round((performance.now() - t0) * 10) / 10);
  try {
    const h = await follow(check, o, AbortSignal.timeout(check.timeoutMs));
    const error = verdict(check, h);
    return { startMs, durationMs: took(), ok: error === null, status: h.status, error, tlsExpiresMs: h.tls, finalUrl: h.url };
  } catch (err) {
    const durationMs = took();
    const cert = isCertError(err);
    const tlsExpiresMs = cert ? await probeCertEnd(check.url, o.allowPrivate, check.timeoutMs) : null;
    const error = `${cert ? "The TLS certificate is not valid: " : ""}${errorText(err, check.timeoutMs)}`;
    return { startMs, durationMs, ok: false, status: null, error, tlsExpiresMs, finalUrl: check.url };
  }
}
