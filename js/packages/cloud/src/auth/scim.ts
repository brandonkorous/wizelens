import { scim, type SCIMIdentityResolution, type SCIMProjectedUserState, type SCIMScope, type SCIMTransactionContext } from "@better-auth/scim";
import type { BetterAuthPlugin } from "better-auth";
import { orgHas } from "../repo/billing.js";
import { scimTokenOf } from "../repo/scim-tokens.js";
import type { AuthDeps } from "./deps.js";

// SCIM 2.0 provisioning from an identity provider (Okta, Entra ID): one connection per organization, its tokens in scim_tokens.

const SCOPES: readonly SCIMScope[] = ["scim.users.read", "scim.users.write", "scim.groups.read", "scim.groups.write"];
export const scimConnectionId = (orgId: string) => `org-${orgId}`;

interface Finder {
  findOne<T>(a: { model: string; where: { field: string; value: unknown }[] }): Promise<T | null>;
  findMany<T>(a: { model: string; where: { field: string; value: unknown }[] }): Promise<T[]>;
}

/** An existing account joins only when its email is confirmed and it is already a member, or at the organization's proven SSO domain. */
async function resolveUser(db: Finder, orgId: string, email: string): Promise<SCIMIdentityResolution> {
  const user = await db.findOne<{ id: string; emailVerified: boolean }>({ model: "user", where: [{ field: "email", value: email.trim().toLowerCase() }] });
  if (!user?.emailVerified) return { action: "create" };
  const member = await db.findOne({ model: "member", where: [{ field: "organizationId", value: orgId }, { field: "userId", value: user.id }] });
  const at = email.trim().toLowerCase().split("@")[1] ?? "";
  const providers = await db.findMany<{ domain: string; domainVerified?: boolean | null }>({ model: "ssoProvider", where: [{ field: "organizationId", value: orgId }] });
  const proven = providers.some((p) => p.domainVerified === true && p.domain.toLowerCase().split(",").map((d) => d.trim()).includes(at));
  return member || proven ? { action: "link", userId: user.id, profile: "preserve" } : { action: "create" };
}

/** Active people are members of the organization; deactivated ones leave it (owners stay, so it keeps one). */
async function reconcile(state: SCIMProjectedUserState, { database }: SCIMTransactionContext): Promise<void> {
  const where = [{ field: "organizationId", value: state.provisioningDomainId }, { field: "userId", value: state.userId }];
  const member = await database.findOne<{ id: string; role: string }>({ model: "member", where });
  if (state.active && !member) {
    await database.create({ model: "member", data: { organizationId: state.provisioningDomainId, userId: state.userId, role: "member", createdAt: new Date() } });
  } else if (!state.active && member && member.role !== "owner") {
    await database.delete({ model: "member", where: [{ field: "id", value: member.id }] });
  }
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** The plugin's tables and columns in our snake_case (db/schema-scim.ts): scimUser becomes scim_users, userId becomes user_id. */
function snakeTables(plugin: BetterAuthPlugin): BetterAuthPlugin {
  for (const [model, table] of Object.entries(plugin.schema ?? {})) {
    (table as { modelName?: string }).modelName = `${snake(model)}s`;
    for (const [name, field] of Object.entries(table.fields)) (field as { fieldName?: string }).fieldName = snake(name);
  }
  return plugin;
}

/** SCIM tokens work only while the organization's plan has SCIM (Business and Enterprise, or any plan with billing off). */
export function scimPlugin(deps: AuthDeps): BetterAuthPlugin {
  const plugin = scim({
    connections: [],
    authentication: {
      verifyBearerToken: async ({ token }) => {
        const found = await scimTokenOf(deps.db, token, Date.now());
        if (!found || !(await orgHas(deps.db, found.orgId, deps.billingOn, "scim"))) return null;
        return { connection: { id: scimConnectionId(found.orgId), provisioningDomainId: found.orgId }, credentialId: found.id, scopes: SCOPES };
      },
    },
    identity: { resolveUser: ({ provisioningDomainId, resource }, { database }) => resolveUser(database as unknown as Finder, provisioningDomainId, resource.primaryEmail) },
    projection: { reconcileUser: reconcile },
  });
  return snakeTables(plugin as unknown as BetterAuthPlugin);
}
