import { sso } from "@better-auth/sso";
import type { BetterAuthPlugin } from "better-auth";
import type { AuthDeps } from "./deps.js";
import { ssoSchema } from "./schema-names.js";
import { joinViaSso } from "./sso-join.js";
import { linkAtRequiredDomain } from "./sso-required.js";

/** The DNS record that proves a domain: `_wizelens-sso-<providerId>.<domain>` TXT `<token>`. */
export const SSO_TOKEN_PREFIX = "wizelens-sso";

interface Finder {
  findOne<T>(a: { model: string; where: { field: string; value: string }[] }): Promise<T | null>;
}

interface ProviderRow {
  organizationId?: string | null;
  domain: string;
  domainVerified?: boolean | null;
}

/** The SSO provider behind a new account, when Better Auth makes it from a single sign-on. */
export function ssoProviderOf(source: unknown): string | undefined {
  const s = source as { method?: string; sso?: { providerId?: unknown } } | undefined;
  return s?.method?.startsWith("sso-") && typeof s.sso?.providerId === "string" ? s.sso.providerId : undefined;
}

/** True when an organization's provider has a proven domain and the email is at exactly that domain. */
export async function ssoTrusts(db: Finder, providerId: string, email: string): Promise<boolean> {
  const p = await db.findOne<ProviderRow>({ model: "ssoProvider", where: [{ field: "providerId", value: providerId }] });
  const at = email.trim().toLowerCase().split("@")[1] ?? "";
  const domains = (p?.domain ?? "").toLowerCase().split(",").map((d) => d.trim());
  return !!p?.organizationId && p.domainVerified === true && !!at && domains.includes(at);
}

/** Organization SSO with OIDC or SAML. Sign-in works once the domain is proven in DNS; new people join that organization as members, removed people do not. */
export function ssoPlugin(deps: AuthDeps): BetterAuthPlugin {
  return sso({
    schema: ssoSchema,
    providersLimit: 20,
    domainVerification: { enabled: true, tokenPrefix: SSO_TOKEN_PREFIX },
    resolveUser: (input, { database }) => linkAtRequiredDomain(input.providerId, input.providerUser.email, database),
    // Our own join step, so a removed person is not added back (auth/sso-join.ts).
    organizationProvisioning: { disabled: true },
    provisionUserOnEveryLogin: true,
    provisionUser: ({ user, provider }) => joinViaSso(deps.db, provider.organizationId, provider.providerId, user, Date.now()),
    saml: { enableInResponseToValidation: true, allowIdpInitiated: false, requireTimestamps: true, clockSkew: 2 * 60_000, algorithms: { onDeprecated: "reject" } },
  }) as unknown as BetterAuthPlugin;
}
