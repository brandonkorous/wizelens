import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Channel } from "../repo/alerts.js";

export interface Notice {
  rule: string;
  project: string;
  state: "fired" | "resolved" | "test";
  message: string;
  value: number | null;
  threshold: number;
  timeMs: number;
  /** Link to the project in the dashboard. */
  url: string;
  /** For "above normal" rules: the normal value and the line it crossed. */
  baseline?: { normal: number; upper: number } | null;
  /** The problem this alert is part of, when one was found as it fired. */
  problem?: NoticeProblem | null;
}

/** A problem card on the Problems page, named in a notice. */
export interface NoticeProblem {
  id: string;
  title: string;
  /** The suspected cause in one sentence, or null. */
  cause: string | null;
  /** Link to the problem in the dashboard. */
  url: string;
}

type HttpChannel = Extract<Channel, { url: string }>;

/** How notices leave: HTTP for webhooks and Slack, and a mail function that sends to the members still allowed and says what it did. */
export interface Outbox {
  http: typeof fetch;
  allowPrivate: boolean;
  email: (to: readonly string[], n: Notice) => string;
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const isPrivate = (ip: string) => (isIP(ip) === 6 ? /^(::1|fc|fd|fe80|::ffff:(10|127|169\.254|192\.168)\.)/i.test(ip) || ip === "::" : PRIVATE_V4.some((r) => r.test(ip)));

/** A webhook may not point into the service's own network (cloud metadata, databases). Self-hosts can allow it. */
export async function checkTarget(url: string, allowPrivate: boolean): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Not a valid URL.";
  }
  if (u.protocol !== "https:" && !(allowPrivate && u.protocol === "http:")) return "Use an https:// URL.";
  if (allowPrivate) return null;
  const addresses = isIP(u.hostname) ? [u.hostname] : (await lookup(u.hostname, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) return "The host name does not resolve.";
  return addresses.some(isPrivate) ? "Webhooks cannot point at private or local addresses." : null;
}

/** The notice in words, for Slack and email. */
export function noticeLines(n: Notice): { subject: string; lines: string[] } {
  const verb = n.state === "fired" ? "Alert" : n.state === "resolved" ? "Resolved" : "Test";
  const problem = n.problem ? [`Part of a problem: ${n.problem.title}.${n.problem.cause ? ` Suspected cause: ${n.problem.cause}` : ""}`] : [];
  return { subject: `${verb}: ${n.rule} (${n.project})`, lines: [`${verb}: ${n.rule} in ${n.project}.`, n.message, ...problem] };
}

function bodyOf(channel: HttpChannel, n: Notice): unknown {
  if (channel.kind === "webhook") return n;
  const icon = n.state === "fired" ? ":rotating_light:" : n.state === "resolved" ? ":white_check_mark:" : ":bell:";
  const { subject } = noticeLines(n);
  const problem = n.problem ? `\nPart of a problem: <${n.problem.url}|${n.problem.title}>${n.problem.cause ? `. Suspected cause: ${n.problem.cause}` : ""}` : "";
  return { text: `${icon} *${subject}*\n${n.message}${problem}\n<${n.url}|Open WizeLens>` };
}

async function post(c: HttpChannel, n: Notice, out: Outbox): Promise<string> {
  const problem = await checkTarget(c.url, out.allowPrivate);
  if (problem) return `${c.kind}: ${problem}`;
  try {
    const res = await out.http(c.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyOf(c, n)), signal: AbortSignal.timeout(5000), redirect: "error" });
    return `${c.kind}: ${res.ok ? "sent" : `HTTP ${res.status}`}`;
  } catch (err) {
    return `${c.kind}: ${err instanceof Error ? err.message : "failed"}`;
  }
}

/** Send to every channel. Returns one line per channel, for the delivery note of the event. */
export async function deliver(channels: readonly Channel[], n: Notice, out: Outbox): Promise<string> {
  const results = await Promise.all(channels.map(async (c) => (c.kind === "email" ? out.email(c.to, n) : post(c, n, out))));
  return results.join("; ") || "no channels";
}
