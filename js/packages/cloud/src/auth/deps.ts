import type { SignupMode } from "../config.js";
import type { Db } from "../db/db.js";
import type { Mailer } from "../mail/mailer.js";
import type { AuthSecret } from "./secret.js";

/** What the Better Auth setup needs from the cloud. */
export interface AuthDeps {
  db: Db;
  /** The cloud's own origin, for links and passkeys, for example https://lens.example.com. */
  publicUrl: string;
  /** Origins allowed to send changes: the public one (and its 127.0.0.1 twin for a local default). */
  trustedOrigins: string[];
  /** Identity provider origins the cloud may fetch OIDC settings from (`--sso-origins`). */
  ssoOrigins: string[];
  secrets: AuthSecret[];
  signup: SignupMode;
  mailer: Mailer;
  /** The first account's one-time token: null once an account exists. */
  setup: { token(): string | null; done(): void };
  checkPwned: boolean;
  retentionDays: number;
}

/** A link into the dashboard. Tokens go in the hash, so they never reach a server log. */
export const appLink = (deps: Pick<AuthDeps, "publicUrl">, route: string, token: string): string =>
  `${deps.publicUrl}/_wizelens/#/${route}?token=${encodeURIComponent(token)}`;
