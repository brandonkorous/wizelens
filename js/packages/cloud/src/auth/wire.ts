import { randomBytes } from "node:crypto";
import type { CloudConfig } from "../config.js";
import type { Db } from "../db/db.js";
import type { Mailer } from "../mail/mailer.js";
import { userCount } from "../repo/users.js";
import { createAuth, type WizeAuth } from "./auth.js";
import type { AuthDeps } from "./deps.js";
import { clearAuthEnv, resolveSecrets } from "./secret.js";

export interface AuthWiring {
  /** Build Better Auth for the address the cloud listens on. */
  start(listenUrl: string): WizeAuth;
  /** The first account's link while no account exists, else null. */
  setupLink(): string | null;
}

/** The one-time setup token: from the config, or new. Gone once the first account exists. */
async function setupGate(db: Db, configured: string | undefined): Promise<AuthDeps["setup"]> {
  let open = (await userCount(db)) === 0;
  const token = configured ?? randomBytes(24).toString("base64url");
  return { token: () => (open ? token : null), done: () => void (open = false) };
}

/** The public origin, plus 127.0.0.1 next to localhost (or the reverse) when the cloud runs on its default local address. */
function originsOf(publicUrl: string, local: boolean): string[] {
  const origin = new URL(publicUrl).origin;
  if (!local) return [origin];
  return [origin, origin.includes("//localhost") ? origin.replace("//localhost", "//127.0.0.1") : origin.replace("//127.0.0.1", "//localhost")];
}

/** Secrets, the setup gate, and the rest Better Auth needs; Better Auth itself starts once the address is known. */
export async function wireAuth(db: Db, config: CloudConfig, mailer: Mailer): Promise<AuthWiring> {
  clearAuthEnv();
  const [secrets, setup] = await Promise.all([resolveSecrets(db, config.authSecret), setupGate(db, config.setupToken)]);
  let base = config.publicUrl;
  return {
    start: (listenUrl) => {
      base = config.publicUrl ?? listenUrl.replace("//127.0.0.1", "//localhost");
      const deps: AuthDeps = {
        db,
        publicUrl: new URL(base).origin,
        trustedOrigins: originsOf(base, !config.publicUrl),
        ssoOrigins: config.ssoOrigins,
        secrets,
        signup: config.signup,
        mailer,
        setup,
        checkPwned: config.checkPwnedPasswords ?? db.kind === "postgres",
        retentionDays: config.retentionDays,
      };
      return createAuth(deps);
    },
    setupLink: () => {
      const token = setup.token();
      return token && base ? `${base}/_wizelens/#/setup?token=${token}` : null;
    },
  };
}
