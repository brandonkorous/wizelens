import type { CloudConfig } from "../config.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** True when mail really leaves (SMTP, or a test sender). False: mail is written to the log only. */
  readonly live: boolean;
  /** Queue one email. Never throws and never waits, so a slow mail server cannot slow or reveal anything. */
  send(mail: Mail): void;
  close(): Promise<void>;
}

type Sender = (mail: Mail) => Promise<void>;

async function smtpSender(config: CloudConfig): Promise<{ send: Sender; close: () => Promise<void> }> {
  const { createTransport } = await import("nodemailer");
  const transport = createTransport(config.smtpUrl!, { from: config.mailFrom });
  return { send: async (m) => void (await transport.sendMail({ from: config.mailFrom, ...m })), close: async () => transport.close() };
}

const logSender: Sender = async (m) => console.info(`[wizelens-cloud] mail (no --smtp-url, not sent) to ${m.to}: ${m.subject}\n${m.text}\n`);

/** The cloud's mail: SMTP when `--smtp-url` is set, the test sender when given, otherwise the log. */
export async function createMailer(config: CloudConfig): Promise<Mailer> {
  const smtp = config.smtpUrl && !config.sendMail ? await smtpSender(config) : undefined;
  const send: Sender = config.sendMail ?? smtp?.send ?? logSender;
  return {
    live: !!(config.sendMail || smtp),
    send: (mail) => void send(mail).catch((err: unknown) => console.error(`[wizelens-cloud] mail to ${mail.to} failed:`, err instanceof Error ? err.message : err)),
    close: async () => smtp?.close(),
  };
}
