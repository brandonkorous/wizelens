import { stripe } from "@better-auth/stripe";
import type { BetterAuthPlugin } from "better-auth";
import type { AuthDeps } from "../auth/deps.js";
import { can, isRole } from "../auth/roles.js";
import { stripeSchema } from "../auth/schema-names.js";
import { membership } from "../repo/orgs.js";
import type { StripeClient, StripePrices } from "./options.js";

/** What the Stripe plugin needs: the client, the webhook secret, the prices, and the plan sync that runs on every subscription change. */
export interface StripeDeps {
  client: StripeClient;
  webhookSecret: string;
  prices: StripePrices;
  /** Set orgs.plan from the organization's subscriptions (billing/sync.ts). */
  sync(orgId: string): Promise<void>;
}

/** Only owners and admins of the organization buy, change, or cancel its plan. */
async function mayBill(deps: AuthDeps, userId: string, orgId: string): Promise<boolean> {
  const m = await membership(deps.db, userId, orgId);
  return !!m && isRole(m.role) && can(m.role, "manage");
}

const plansOf = (p: StripePrices) => [
  { name: "team", priceId: p.teamMonthly, annualDiscountPriceId: p.teamAnnual },
  { name: "business", priceId: p.businessMonthly, annualDiscountPriceId: p.businessAnnual },
];

/** Better Auth's Stripe plugin: the organization is the customer, Checkout starts a plan, the portal changes or cancels it. */
export function stripePlugin(deps: AuthDeps, s: StripeDeps): BetterAuthPlugin {
  const sync = async ({ subscription }: { subscription: { referenceId: string } }) => s.sync(subscription.referenceId);
  return stripe({
    stripeClient: s.client,
    stripeWebhookSecret: s.webhookSecret,
    createCustomerOnSignUp: false,
    schema: stripeSchema,
    organization: {
      enabled: true,
      getCustomerCreateParams: async (org, ctx) => ({ email: ctx.context.session?.user.email, metadata: { wizelensOrgId: org.id } }),
    },
    subscription: {
      enabled: true,
      plans: plansOf(s.prices),
      requireEmailVerification: deps.mailer.live,
      authorizeReference: async ({ user, referenceId }) => mayBill(deps, user.id, referenceId),
      getCheckoutSessionParams: () => ({ params: { allow_promotion_codes: true, billing_address_collection: "auto" } }),
      onSubscriptionComplete: sync,
      onSubscriptionCreated: sync,
      onSubscriptionUpdate: sync,
      onSubscriptionDeleted: sync,
    },
  }) as unknown as BetterAuthPlugin;
}
