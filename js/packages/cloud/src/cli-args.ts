import { parseArgs } from "node:util";
import type { CloudOptions, SignupMode } from "./config.js";

export const USAGE = `wizelens-cloud: the WizeLens service for many teams.

Usage: wizelens-cloud [options]

  --database <url>          postgres://..., pglite:<folder>, or memory.
                            Default pglite:./.wizelens-cloud.          (DATABASE_URL)
  --port <n>                Default 5970.                               (PORT)
  --host <addr>             Default 0.0.0.0.                            (WIZELENS_CLOUD_HOST)
  --public-url <url>        The address people use, for links.          (WIZELENS_CLOUD_PUBLIC_URL)
  --signup <invite|open>    Who can make an account. Default invite.    (WIZELENS_CLOUD_SIGNUP)
  --retention-days <n>      Default for new organizations. Default 30.  (WIZELENS_CLOUD_RETENTION_DAYS)
  --allow-private-webhooks  Let alert webhooks reach private addresses. (WIZELENS_CLOUD_ALLOW_PRIVATE_WEBHOOKS=1)
  --help                    Show this help.
`;

const int = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const signupOf = (v: string | undefined): SignupMode | undefined => (v === "open" || v === "invite" ? v : undefined);

/** Options from the command line, then from the environment. */
export function optionsFromArgs(argv: string[], env: NodeJS.ProcessEnv): CloudOptions | "help" {
  const { values: a } = parseArgs({
    args: argv,
    options: {
      database: { type: "string" },
      port: { type: "string" },
      host: { type: "string" },
      "public-url": { type: "string" },
      signup: { type: "string" },
      "retention-days": { type: "string" },
      "allow-private-webhooks": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (a.help) return "help";
  return {
    database: a.database ?? env.DATABASE_URL,
    port: int(a.port ?? env.PORT),
    host: a.host ?? env.WIZELENS_CLOUD_HOST,
    publicUrl: a["public-url"] ?? env.WIZELENS_CLOUD_PUBLIC_URL,
    signup: signupOf(a.signup ?? env.WIZELENS_CLOUD_SIGNUP),
    retentionDays: int(a["retention-days"] ?? env.WIZELENS_CLOUD_RETENTION_DAYS),
    allowPrivateWebhooks: a["allow-private-webhooks"] ?? env.WIZELENS_CLOUD_ALLOW_PRIVATE_WEBHOOKS === "1",
  };
}
