// Sends alert notices: webhooks, Slack, Microsoft Teams, Discord, PagerDuty, and (on the cloud) email.
import type { AlertChannel, AlertNoticeState } from "@wizeworks/lens-core";
import { checkTarget } from "./target.js";

export interface Notice {
  ruleId: string;
  rule: string;
  project: string;
  state: AlertNoticeState;
  message: string;
  value: number | null;
  threshold: number;
  timeMs: number;
  /** Link to the rule in the dashboard. */
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

/** How notices leave: HTTP, and on the cloud a mail function that sends to members still allowed and says what it did. */
export interface Outbox {
  http: typeof fetch;
  allowPrivate: boolean;
  email?: (to: readonly string[], n: Notice) => string;
  /** PagerDuty's Events API v2; tests point it elsewhere. */
  pagerDutyUrl?: string;
}

export const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";
const VERB: Record<AlertNoticeState, string> = { fired: "Alert", resolved: "Resolved", remind: "Still firing", test: "Test" };
const COLOR: Record<AlertNoticeState, string> = { fired: "D93025", resolved: "1E8E3E", remind: "E37400", test: "5F6368" };
const SLACK_ICON: Record<AlertNoticeState, string> = { fired: ":rotating_light:", resolved: ":white_check_mark:", remind: ":repeat:", test: ":bell:" };

/** The notice in words, for chat and email. */
export function noticeLines(n: Notice): { subject: string; lines: string[] } {
  const verb = VERB[n.state];
  const p = n.problem;
  const problem = p ? [`Part of a problem: ${p.title}.${p.cause ? ` Suspected cause: ${p.cause}` : ""}`] : [];
  return { subject: `${verb}: ${n.rule} (${n.project})`, lines: [`${verb}: ${n.rule} in ${n.project}.`, n.message, ...problem] };
}

type UrlChannel = Extract<AlertChannel, { url: string }>;

/** The problem line of a chat message, with its link written the chat tool's way; "" without a problem. */
function problemText(n: Notice, link: (url: string, title: string) => string): string {
  const p = n.problem;
  return p ? `\nPart of a problem: ${link(p.url, p.title)}${p.cause ? `. Suspected cause: ${p.cause}` : ""}` : "";
}

/** The body each chat tool expects. Webhooks get the notice as JSON. */
export function chatBody(kind: UrlChannel["kind"], n: Notice): unknown {
  const { subject } = noticeLines(n);
  if (kind === "webhook") return n;
  if (kind === "slack") return { text: `${SLACK_ICON[n.state]} *${subject}*\n${n.message}${problemText(n, (u, t) => `<${u}|${t}>`)}\n<${n.url}|Open WizeLens>` };
  if (kind === "discord") return { content: `**${subject}**\n${n.message}${problemText(n, (u, t) => `[${t}](${u})`)}\n${n.url}`, allowed_mentions: { parse: [] } };
  const open = [{ "@type": "OpenUri", name: "Open WizeLens", targets: [{ os: "default", uri: n.url }] }];
  const text = `${n.message}${problemText(n, (u, t) => `[${t}](${u})`)}`;
  return { "@type": "MessageCard", "@context": "https://schema.org/extensions", summary: subject, themeColor: COLOR[n.state], title: subject, text, potentialAction: open };
}

/** PagerDuty events: fired and reminders trigger (one incident per rule), resolved resolves, and a test triggers then resolves its own key. */
export function pagerDutyEvents(routingKey: string, n: Notice): unknown[] {
  const key = n.state === "test" ? `wizelens-${n.ruleId}-test` : `wizelens-${n.ruleId}`;
  const trigger = { routing_key: routingKey, event_action: "trigger", dedup_key: key, payload: { summary: `${n.rule}: ${n.message}`.slice(0, 1024), source: n.project, severity: "error", timestamp: new Date(n.timeMs).toISOString() }, links: [{ href: n.url, text: "Open WizeLens" }] };
  const resolve = { routing_key: routingKey, event_action: "resolve", dedup_key: key };
  if (n.state === "resolved") return [resolve];
  return n.state === "test" ? [trigger, resolve] : [trigger];
}

async function send(out: Outbox, url: string, body: unknown): Promise<string> {
  try {
    const res = await out.http(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000), redirect: "error" });
    return res.ok ? "sent" : `HTTP ${res.status}`;
  } catch (err) {
    return err instanceof Error ? err.message : "failed";
  }
}

async function deliverOne(c: AlertChannel, n: Notice, out: Outbox): Promise<string> {
  if (c.kind === "email") return out.email ? out.email(c.to, n) : "email: this host sends no email";
  if (c.kind === "pagerduty") {
    let result = "sent";
    for (const event of pagerDutyEvents(c.routingKey, n)) result = await send(out, out.pagerDutyUrl ?? PAGERDUTY_EVENTS_URL, event);
    return `pagerduty: ${result}`;
  }
  const problem = await checkTarget(c.url, out.allowPrivate);
  return `${c.kind}: ${problem ?? (await send(out, c.url, chatBody(c.kind, n)))}`;
}

/** Send to every channel. Returns one line per channel, for the delivery note of the event. */
export async function deliver(channels: readonly AlertChannel[], n: Notice, out: Outbox): Promise<string> {
  const results = await Promise.all(channels.map((c) => deliverOne(c, n, out)));
  return results.join("; ") || "no channels";
}
