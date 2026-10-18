import { DEFAULT_REDACT_KEYS } from "@wizeworks/lens-core";
import type { Mail } from "./mail/mailer.js";

export type SignupMode = "open" | "invite";

export interface CloudOptions {
  /** "postgres://...", "pglite:<folder>", or "memory". Default "pglite:./.wizelens-cloud". */
  database?: string;
  /** Default 5970. 0 picks a free port. */
  port?: number;
  /** Default "0.0.0.0". */
  host?: string;
  /** The address people use, for links in invites and shares. Default http://localhost:<port>. */
  publicUrl?: string;
  /** "invite": only the first account and invited people can sign up. "open": anyone can. Default "invite". */
  signup?: SignupMode;
  /** Default retention for new organizations, in days. Default 30. */
  retentionDays?: number;
  /** Ingest calls per key per minute. Default 1200. */
  ingestPerMinute?: number;
  /** How often alert rules run, in ms. Default 60000. */
  alertIntervalMs?: number;
  /** Let alert webhooks call private and local addresses, and plain http. For self-hosting on a private network. Default false. */
  allowPrivateWebhooks?: boolean;
  /** Outgoing mail: "smtp://user:pass@host:587" (STARTTLS) or "smtps://user:pass@host:465". Without it, mail is written to the log. */
  smtpUrl?: string;
  /** The sender of every email, for example "WizeLens <alerts@example.com>". */
  mailFrom?: string;
  /** Take the client address from X-Forwarded-For (behind a proxy you run). Default false. */
  trustProxy?: boolean;
  /** Signs sessions and encrypts 2FA secrets: 32+ random characters, or "2:new,1:old" to rotate. Required with Postgres. */
  authSecret?: string;
  /** The one-time token the first account needs. Default: a new random one, printed at start while no account exists. */
  setupToken?: string;
  /** Refuse passwords found in known breaches (sends a 5-character hash prefix to api.pwnedpasswords.com). Default: on with Postgres. */
  checkPwnedPasswords?: boolean;
  /** Identity provider origins for OIDC single sign-on, for example https://acme.okta.com. The cloud fetches OIDC settings only from these. */
  ssoOrigins?: string[];
  redactKeys?: string[];
  uiDir?: string;
  /** For tests: the clock, the HTTP client alerts use, and a mail sender in place of SMTP. */
  now?: () => number;
  fetch?: typeof fetch;
  sendMail?: (mail: Mail) => Promise<void>;
}

type Optional = "uiDir" | "publicUrl" | "smtpUrl" | "sendMail" | "authSecret" | "setupToken" | "checkPwnedPasswords";
export type CloudConfig = Required<Omit<CloudOptions, Optional>> & Pick<CloudOptions, Optional> & { secureCookies: boolean };

/** Mail links must use the public address: a link built from the request's Host header could point anywhere. */
function checkMail(o: CloudOptions): void {
  if (o.smtpUrl && !o.publicUrl) throw new Error("Sending mail needs --public-url, so links in emails point at this cloud.");
  if (o.smtpUrl && !/^smtps?:\/\//.test(o.smtpUrl)) throw new Error("--smtp-url must start with smtp:// or smtps://.");
}

/** Each SSO origin as a bare origin: https, or http on this machine only. */
function ssoOriginsOf(list: readonly string[]): string[] {
  return list.map((raw) => {
    const url = URL.canParse(raw) ? new URL(raw) : null;
    const local = url?.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!url || (url.protocol !== "https:" && !local) || raw.includes("*")) throw new Error(`--sso-origins: "${raw}" must be an https:// origin, like https://acme.okta.com.`);
    return url.origin;
  });
}

export function resolveConfig(o: CloudOptions = {}): CloudConfig {
  checkMail(o);
  return {
    database: o.database ?? "pglite:./.wizelens-cloud",
    port: o.port ?? 5970,
    host: o.host ?? "0.0.0.0",
    publicUrl: o.publicUrl?.replace(/\/+$/, ""),
    signup: o.signup ?? "invite",
    retentionDays: o.retentionDays ?? 30,
    ingestPerMinute: o.ingestPerMinute ?? 1200,
    alertIntervalMs: o.alertIntervalMs ?? 60_000,
    allowPrivateWebhooks: o.allowPrivateWebhooks ?? false,
    smtpUrl: o.smtpUrl,
    mailFrom: o.mailFrom ?? `WizeLens <no-reply@${o.publicUrl ? new URL(o.publicUrl).hostname : "localhost"}>`,
    trustProxy: o.trustProxy ?? false,
    sendMail: o.sendMail,
    authSecret: o.authSecret,
    setupToken: o.setupToken,
    checkPwnedPasswords: o.checkPwnedPasswords,
    ssoOrigins: ssoOriginsOf(o.ssoOrigins ?? []),
    redactKeys: o.redactKeys ?? [...DEFAULT_REDACT_KEYS],
    uiDir: o.uiDir,
    now: o.now ?? Date.now,
    fetch: o.fetch ?? fetch,
    secureCookies: !!o.publicUrl?.startsWith("https://"),
  };
}
