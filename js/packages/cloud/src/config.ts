import { availableParallelism } from "node:os";
import { DEFAULT_REDACT_KEYS, FACT_N_PLUS_ONE, FACT_SLOW_QUERY_MS } from "@wizeworks/lens-core";
import { type BillingConfig, type BillingOptions, resolveBilling } from "./billing/options.js";
import type { Mail } from "./mail/mailer.js";

export type SignupMode = "open" | "invite";

export interface CloudOptions extends BillingOptions {
  /** "postgres://...", "pglite:<folder>", or "memory". Default "pglite:./.wizelens-cloud". */
  database?: string;
  /** Scale mode: telemetry in ClickHouse, `http(s)://user:password@host:8123/database`. Accounts stay in `database`. */
  clickhouseUrl?: string;
  /** Scale mode: worker threads that settle new traces. 0 settles in the main thread. Default: one less than the CPUs, at most 4. */
  settleWorkers?: number;
  /** Default 5970. 0 picks a free port. */
  port?: number;
  /** Default "0.0.0.0". */
  host?: string;
  /** The address people use, for links in invites and shares. Default http://localhost:<port>. */
  publicUrl?: string;
  /** Another address agents use for MCP only, for example https://mcp.wizelens.com, when a proxy sends it to `/_wizelens/mcp`. */
  mcpUrl?: string;
  /** "invite": only the first account and invited people can sign up. "open": anyone can. Default "invite". */
  signup?: SignupMode;
  /** Default retention for new organizations, in days. Default 30. */
  retentionDays?: number;
  /** Ingest calls per key per minute. Default 1200. */
  ingestPerMinute?: number;
  /** How often alert rules run, in ms. Default 60000. */
  alertIntervalMs?: number;
  /** Let alert webhooks and uptime checks call private and local addresses (webhooks: also plain http). For self-hosting on a private network. Default false. */
  allowPrivateWebhooks?: boolean;
  /** PagerDuty's Events API URL; tests point it at a local server. */
  pagerDutyUrl?: string;
  /** Check the packages services report against OSV (only names and versions are sent). Default true. */
  osv?: boolean;
  /** The OSV API; tests point it at a local server. Default https://api.osv.dev. */
  osvUrl?: string;
  /** Outgoing mail: "smtp://user:pass@host:587" (STARTTLS) or "smtps://user:pass@host:465". Without it, mail is written to the log. */
  smtpUrl?: string;
  /** Outgoing mail through the Resend API (a `re_` key). Used in place of `smtpUrl`. */
  resendApiKey?: string;
  /** The `whsec_` signing secret of the Resend webhook, so bounces and spam complaints reach the suppression list. */
  resendWebhookSecret?: string;
  /** The sender of every email, for example "WizeLens <alerts@example.com>". */
  mailFrom?: string;
  /** Where replies go, for example "hello@example.com", when the sender has no inbox. Default: none (replies go to the sender). */
  mailReplyTo?: string;
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
  /** A database call this slow or slower counts as slow, in ms. Default 100. Projects can set their own. */
  slowQueryMs?: number;
  /** This many similar calls in one request is an N+1. Default 5. Projects can set their own. */
  nPlusOneThreshold?: number;
  uiDir?: string;
  /** For tests: the clock, the HTTP client alerts use, and a mail sender in place of SMTP. */
  now?: () => number;
  fetch?: typeof fetch;
  sendMail?: (mail: Mail) => Promise<void>;
  /** For tests: false keeps background jobs off, so a test runs them itself. Default true. */
  jobs?: boolean;
}

type Optional = "stripeSecretKey" | "stripeWebhookSecret" | "stripePrices" | "stripeClient" | "uiDir" | "clickhouseUrl" | "publicUrl" | "mcpUrl" | "smtpUrl" | "resendApiKey" | "resendWebhookSecret" | "mailReplyTo" | "sendMail" | "authSecret" | "setupToken" | "checkPwnedPasswords" | "pagerDutyUrl";
export type CloudConfig = Required<Omit<CloudOptions, Optional>> & Pick<CloudOptions, Optional> & { secureCookies: boolean; billing: BillingConfig };

/** Mail links must use the public address: a link built from the request's Host header could point anywhere. */
function checkMail(o: CloudOptions): void {
  if ((o.smtpUrl || o.resendApiKey) && !o.publicUrl) throw new Error("Sending mail needs --public-url, so links in emails point at this cloud.");
  if (o.smtpUrl && o.resendApiKey) throw new Error("Pick one mail service: --resend-api-key or --smtp-url, not both.");
  if (o.smtpUrl && !/^smtps?:\/\//.test(o.smtpUrl)) throw new Error("--smtp-url must start with smtp:// or smtps://.");
  if (o.resendApiKey && !o.resendApiKey.startsWith("re_")) throw new Error("--resend-api-key must be a Resend API key (it starts with re_).");
  if (o.resendWebhookSecret && !o.resendWebhookSecret.startsWith("whsec_")) throw new Error("--resend-webhook-secret must start with whsec_.");
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

/** The MCP address as a bare origin: https, or http on this machine only. */
function mcpUrlOf(o: CloudOptions): string | undefined {
  if (!o.mcpUrl) return undefined;
  const url = URL.canParse(o.mcpUrl) ? new URL(o.mcpUrl) : null;
  const local = url?.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!url || (url.protocol !== "https:" && !local) || url.pathname !== "/" || url.search) throw new Error(`--mcp-url: "${o.mcpUrl}" must be an https:// origin, like https://mcp.example.com.`);
  return url.origin;
}

export function resolveConfig(o: CloudOptions = {}): CloudConfig {
  checkMail(o);
  return {
    database: o.database ?? "pglite:./.wizelens-cloud",
    clickhouseUrl: o.clickhouseUrl,
    settleWorkers: o.settleWorkers ?? Math.min(4, availableParallelism() - 1),
    port: o.port ?? 5970,
    host: o.host ?? "0.0.0.0",
    publicUrl: o.publicUrl?.replace(/\/+$/, ""),
    mcpUrl: mcpUrlOf(o),
    signup: o.signup ?? "invite",
    retentionDays: o.retentionDays ?? 30,
    ingestPerMinute: o.ingestPerMinute ?? 1200,
    alertIntervalMs: o.alertIntervalMs ?? 60_000,
    allowPrivateWebhooks: o.allowPrivateWebhooks ?? false,
    pagerDutyUrl: o.pagerDutyUrl,
    smtpUrl: o.smtpUrl,
    resendApiKey: o.resendApiKey,
    resendWebhookSecret: o.resendWebhookSecret,
    mailFrom: o.mailFrom ?? `WizeLens <no-reply@${o.publicUrl ? new URL(o.publicUrl).hostname : "localhost"}>`,
    mailReplyTo: o.mailReplyTo,
    trustProxy: o.trustProxy ?? false,
    sendMail: o.sendMail,
    jobs: o.jobs ?? true,
    authSecret: o.authSecret,
    setupToken: o.setupToken,
    checkPwnedPasswords: o.checkPwnedPasswords,
    ssoOrigins: ssoOriginsOf(o.ssoOrigins ?? []),
    redactKeys: o.redactKeys ?? [...DEFAULT_REDACT_KEYS],
    slowQueryMs: o.slowQueryMs ?? FACT_SLOW_QUERY_MS,
    nPlusOneThreshold: o.nPlusOneThreshold ?? FACT_N_PLUS_ONE,
    uiDir: o.uiDir,
    now: o.now ?? Date.now,
    fetch: o.fetch ?? fetch,
    osv: o.osv ?? true,
    osvUrl: o.osvUrl ?? "https://api.osv.dev",
    secureCookies: !!o.publicUrl?.startsWith("https://"),
    billing: resolveBilling(o),
  };
}
