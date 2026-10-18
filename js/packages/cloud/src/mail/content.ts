import type { MailKind } from "./mailer.js";
import type { Tone } from "./theme.js";

/** One part of an email body. The layout decides how each kind looks; the text version uses the same parts. */
export type Block =
  | { kind: "text"; text: string }
  | { kind: "facts"; rows: { label: string; value: string }[] }
  | { kind: "note"; text: string };

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
}

export const text = (t: string): Block => ({ kind: "text", text: t });
export const note = (t: string): Block => ({ kind: "note", text: t });
export const facts = (rows: [string, string][]): Block => ({ kind: "facts", rows: rows.map(([label, value]) => ({ label, value })) });
