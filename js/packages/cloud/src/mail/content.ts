import type { MailKind } from "./mailer.js";
import type { Tone } from "./theme.js";

/** One part of an email body. The layout decides how each kind looks; the text version uses the same parts. */
export type Block =
  | { kind: "text"; text: string }
  | { kind: "facts"; rows: { label: string; value: string }[] }
  | { kind: "note"; text: string }
  /** Numbers side by side, each with how it changed. */
  | { kind: "stats"; items: Stat[] }
  /** A titled list, for example the slowest endpoints. */
  | { kind: "list"; title: string; items: { text: string; meta?: string }[] };

export interface Stat {
  label: string;
  value: string;
  /** "+12% vs last week". */
  change?: string;
  tone?: Tone;
}

/** What an email says, with no markup. Templates in emails.ts make these; layout.tsx and text.ts draw them. */
export interface EmailContent {
  kind: MailKind;
  subject: string;
  /** The line inboxes show after the subject. */
  preview: string;
  heading: string;
  /** The status dot next to the logo: blue for account mail, red when an alert fires, green when it resolves. */
  tone: Tone;
  blocks: Block[];
  action?: { label: string; url: string };
  /** Why the person got this email. */
  footer: string;
  /** For repeated mail: a one-click stop link, also sent as the List-Unsubscribe header. */
  unsubscribe?: { label: string; url: string };
}

export const text = (t: string): Block => ({ kind: "text", text: t });
export const note = (t: string): Block => ({ kind: "note", text: t });
export const facts = (rows: [string, string][]): Block => ({ kind: "facts", rows: rows.map(([label, value]) => ({ label, value })) });
export const stats = (items: Stat[]): Block => ({ kind: "stats", items });
export const list = (title: string, items: { text: string; meta?: string }[]): Block => ({ kind: "list", title, items });
