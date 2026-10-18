import type { CloudConfig } from "../config.js";
import type { Queryable } from "../db/db.js";
import { suppressionOf } from "../repo/suppressions.js";
import { resendSender } from "./resend.js";

/** "account": mail the person asked for. "security": notices about their own account. The rest: mail someone or something else started. */
export type MailKind = "account" | "security" | "invite" | "alert" | "team" | "health" | "digest";

/** Kinds a spam complaint does not stop: the person asked for them, or they protect the account. */
const ALWAYS = new Set<MailKind>(["account", "security"]);

export interface Mail {
  kind: MailKind;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, for example List-Unsubscribe. */
  headers?: Record<string, string>;
}

export type MailVia = "resend" | "smtp" | "test" | "log";

export interface Mailer {
  /** True when mail really leaves (Resend, SMTP, or a test sender). False: mail is written to the log only. */
  readonly live: boolean;
  readonly via: MailVia;
  /** Queue one email (or one still rendering). Never throws and never waits, so a slow mail server cannot slow or reveal anything. */
  send(mail: Mail | Promise<Mail>): void;
  close(): Promise<void>;
}

type Sender = (mail: Mail) => Promise<void>;
interface Transport {
  via: MailVia;
  send: Sender;
  close?: () => Promise<void>;
}

async function smtpSender(config: CloudConfig): Promise<Transport> {
  const { createTransport } = await import("nodemailer");
  const defaults = { from: config.mailFrom, ...(config.mailReplyTo ? { replyTo: config.mailReplyTo } : {}) };
  const transport = createTransport(config.smtpUrl!, defaults);
  return { via: "smtp", send: async (m) => void (await transport.sendMail({ ...defaults, ...m })), close: async () => transport.close() };
}

const logSender: Sender = async (m) => console.info(`[wizelens-cloud] mail (no mail service set, not sent) to ${m.to}: ${m.subject}\n${m.text}\n`);

/** The test sender, then Resend, then SMTP, then the log. */
async function transportOf(config: CloudConfig): Promise<Transport> {
  if (config.sendMail) return { via: "test", send: config.sendMail };
  if (config.resendApiKey) return { via: "resend", send: resendSender({ apiKey: config.resendApiKey, from: config.mailFrom, replyTo: config.mailReplyTo, fetch: config.fetch }) };
  if (config.smtpUrl) return smtpSender(config);
  return { via: "log", send: logSender };
}

/** A bounce skips every email. A complaint skips mail the person did not ask for. */
async function skipReason(db: Queryable, mail: Mail): Promise<string | null> {
  const reason = await suppressionOf(db, mail.to);
  if (reason === "bounce") return "it bounced before";
  if (reason === "complaint" && !ALWAYS.has(mail.kind)) return "it marked our mail as spam";
  return null;
}

/** The cloud's mail, with the suppression list checked before each send. */
export async function createMailer(config: CloudConfig, db: Queryable): Promise<Mailer> {
  const t = await transportOf(config);
  const deliver = async (pending: Mail | Promise<Mail>) => {
    const mail = await pending;
    const skip = await skipReason(db, mail);
    if (skip) return console.info(`[wizelens-cloud] mail to ${mail.to} skipped: ${skip}.`);
    await t.send(mail).catch((err: unknown) => {
      throw new Error(`mail to ${mail.to} failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  };
  return {
    live: t.via !== "log",
    via: t.via,
    send: (mail) => void deliver(mail).catch((err: unknown) => console.error("[wizelens-cloud]", err instanceof Error ? err.message : err)),
    close: async () => t.close?.(),
  };
}
