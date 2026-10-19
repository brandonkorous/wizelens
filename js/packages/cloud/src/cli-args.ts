import { parseArgs } from "node:util";
import type { CloudOptions, SignupMode } from "./config.js";

export const USAGE = `wizelens-cloud: the WizeLens service for many teams.

Usage: wizelens-cloud [options]

  --database <url>          postgres://..., pglite:<folder>, or memory.
                            Default pglite:./.wizelens-cloud.          (DATABASE_URL)
  --clickhouse <url>        Scale mode: telemetry in ClickHouse,        (WIZELENS_CLOUD_CLICKHOUSE_URL)
                            http://user:pass@host:8123/database.
  --port <n>                Default 5970.                               (PORT)
  --host <addr>             Default 0.0.0.0.                            (WIZELENS_CLOUD_HOST)
  --public-url <url>        The address people use, for links.          (WIZELENS_CLOUD_PUBLIC_URL)
  --signup <invite|open>    Who can make an account. Default invite.    (WIZELENS_CLOUD_SIGNUP)
  --retention-days <n>      Default for new organizations. Default 30.  (WIZELENS_CLOUD_RETENTION_DAYS)
  --ingest-per-minute <n>   Ingest calls per key per minute. Default    (WIZELENS_CLOUD_INGEST_PER_MINUTE)
                            1200.
  --allow-private-webhooks  Let alert webhooks reach private addresses. (WIZELENS_CLOUD_ALLOW_PRIVATE_WEBHOOKS=1)
  --auth-secret <text>      Signs sessions, encrypts 2FA secrets. 32+   (WIZELENS_CLOUD_AUTH_SECRET)
                            characters; "2:new,1:old" rotates.
                            Required with Postgres.
  --resend-api-key <key>    Outgoing mail through Resend (re_...).      (WIZELENS_CLOUD_RESEND_API_KEY)
                            Needs --public-url.
  --resend-webhook-secret <s>  The Resend webhook's whsec_ secret:     (WIZELENS_CLOUD_RESEND_WEBHOOK_SECRET)
                            bounces and complaints stop later mail.
                            Webhook URL: <public-url>/_wizelens/api/mail/resend
  --smtp-url <url>          Or mail over SMTP: smtp://user:pass@host:587 (WIZELENS_CLOUD_SMTP_URL)
                            or smtps://...:465. Needs --public-url.
  --mail-from <address>     Sender, e.g. "WizeLens <a@b.com>".          (WIZELENS_CLOUD_MAIL_FROM)
  --mail-reply-to <address> Where replies go, e.g. "hello@b.com".       (WIZELENS_CLOUD_MAIL_REPLY_TO)
  --trust-proxy             Read the client address from the last       (WIZELENS_CLOUD_TRUST_PROXY=1)
                            X-Forwarded-For entry (your own proxy only).
  --setup-token <text>      The first account's token. Default: random, (WIZELENS_CLOUD_SETUP_TOKEN)
                            printed at start while no account exists.
  --check-pwned-passwords   Refuse breached passwords. Default on with  (WIZELENS_CLOUD_CHECK_PWNED=1|0)
  --no-check-pwned-passwords Postgres, off with PGlite.
  --sso-origins <list>      Identity provider origins for OIDC single   (WIZELENS_CLOUD_SSO_ORIGINS)
                            sign-on, comma separated, for example
                            https://acme.okta.com. SAML needs none.
  --help                    Show this help.
`;

const int = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const signupOf = (v: string | undefined): SignupMode | undefined => (v === "open" || v === "invite" ? v : undefined);
const text = (...v: (string | undefined)[]) => v.find((x) => x !== undefined && x !== "");
const list = (v: string | undefined) => v?.split(",").map((s) => s.trim()).filter(Boolean);
const flag = (v: string | undefined) => (v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : undefined);

const OPTIONS = {
  database: { type: "string" },
  clickhouse: { type: "string" },
  port: { type: "string" },
  host: { type: "string" },
  "public-url": { type: "string" },
  signup: { type: "string" },
  "retention-days": { type: "string" },
  "ingest-per-minute": { type: "string" },
  "allow-private-webhooks": { type: "boolean" },
  "auth-secret": { type: "string" },
  "smtp-url": { type: "string" },
  "resend-api-key": { type: "string" },
  "resend-webhook-secret": { type: "string" },
  "mail-from": { type: "string" },
  "mail-reply-to": { type: "string" },
  "trust-proxy": { type: "boolean" },
  "setup-token": { type: "string" },
  "check-pwned-passwords": { type: "boolean" },
  "no-check-pwned-passwords": { type: "boolean" },
  "sso-origins": { type: "string" },
  help: { type: "boolean", short: "h" },
} as const;

const pwnedOf = (a: { "check-pwned-passwords"?: boolean; "no-check-pwned-passwords"?: boolean }, env: NodeJS.ProcessEnv) =>
  a["no-check-pwned-passwords"] ? false : (a["check-pwned-passwords"] ?? flag(env.WIZELENS_CLOUD_CHECK_PWNED));

/** Options from the command line, then from the environment. */
export function optionsFromArgs(argv: string[], env: NodeJS.ProcessEnv): CloudOptions | "help" {
  const { values: a } = parseArgs({ args: argv, options: OPTIONS });
  if (a.help) return "help";
  return {
    database: a.database ?? env.DATABASE_URL,
    clickhouseUrl: text(a.clickhouse, env.WIZELENS_CLOUD_CLICKHOUSE_URL),
    port: int(a.port ?? env.PORT),
    host: a.host ?? env.WIZELENS_CLOUD_HOST,
    publicUrl: text(a["public-url"], env.WIZELENS_CLOUD_PUBLIC_URL),
    signup: signupOf(a.signup ?? env.WIZELENS_CLOUD_SIGNUP),
    retentionDays: int(a["retention-days"] ?? env.WIZELENS_CLOUD_RETENTION_DAYS),
    ingestPerMinute: int(a["ingest-per-minute"] ?? env.WIZELENS_CLOUD_INGEST_PER_MINUTE),
    allowPrivateWebhooks: a["allow-private-webhooks"] ?? env.WIZELENS_CLOUD_ALLOW_PRIVATE_WEBHOOKS === "1",
    authSecret: text(a["auth-secret"], env.WIZELENS_CLOUD_AUTH_SECRET),
    smtpUrl: text(a["smtp-url"], env.WIZELENS_CLOUD_SMTP_URL),
    resendApiKey: text(a["resend-api-key"], env.WIZELENS_CLOUD_RESEND_API_KEY),
    resendWebhookSecret: text(a["resend-webhook-secret"], env.WIZELENS_CLOUD_RESEND_WEBHOOK_SECRET),
    mailFrom: text(a["mail-from"], env.WIZELENS_CLOUD_MAIL_FROM),
    mailReplyTo: text(a["mail-reply-to"], env.WIZELENS_CLOUD_MAIL_REPLY_TO),
    trustProxy: a["trust-proxy"] ?? env.WIZELENS_CLOUD_TRUST_PROXY === "1",
    setupToken: text(a["setup-token"], env.WIZELENS_CLOUD_SETUP_TOKEN),
    checkPwnedPasswords: pwnedOf(a, env),
    ssoOrigins: list(text(a["sso-origins"], env.WIZELENS_CLOUD_SSO_ORIGINS)),
  };
}
