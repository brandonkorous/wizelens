import type { CloudApp } from "../app.js";
import { BYTES_PER_GB, overageCents, PLANS, type Plan, type PlanId } from "./plans.js";
import { monthOf, usageDays } from "./usage.js";

// `GET api/orgs/:org/usage`: this month's GB, the days, the plan's included GB, overage so far, and a month-end projection.

const DAY_MS = 86_400_000;
const round = (n: number, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;

export interface SubscriptionInfo {
  plan: string;
  status: string;
  interval: string | null;
  periodEndMs: number | null;
  cancelAtPeriodEnd: boolean;
  cancelAtMs: number | null;
}

/** Days gone this month (at least one) and days in it, in UTC. */
export function monthProgress(nowMs: number): { elapsed: number; total: number } {
  const d = new Date(nowMs);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { elapsed: Math.max(1, (nowMs - start) / DAY_MS), total: (end - start) / DAY_MS };
}

async function subscriptionOf(app: CloudApp, orgId: string): Promise<SubscriptionInfo | null> {
  const [row] = await app.db.query<{ plan: string; status: string; billing_interval: string | null; end_ms: number | null; cape: boolean | null; cancel_ms: number | null }>(
    `SELECT plan, status, billing_interval, (extract(epoch FROM period_end) * 1000)::double precision AS end_ms, cancel_at_period_end AS cape,
     (extract(epoch FROM cancel_at) * 1000)::double precision AS cancel_ms FROM subscriptions
     WHERE reference_id = $1 AND status IN ('active', 'trialing', 'past_due') ORDER BY period_end DESC NULLS LAST LIMIT 1`,
    [orgId],
  );
  return row ? { plan: row.plan, status: row.status, interval: row.billing_interval, periodEndMs: row.end_ms, cancelAtPeriodEnd: !!row.cape, cancelAtMs: row.cancel_ms } : null;
}

const planView = (p: Plan) => ({ id: p.id, name: p.name, monthlyUsd: p.monthlyUsd, annualUsd: p.annualUsd, includedGb: p.includedGb, maxRetentionDays: p.maxRetentionDays, overage: p.overage, features: p.features });

/** Everything the Billing page and the usage banner show. */
export async function usageSummary(app: CloudApp, orgId: string) {
  const now = app.config.now();
  const state = await app.billing.limits.state(orgId);
  if (!state) return null;
  const { limits } = state;
  const included = limits.includedGb;
  const days = (await usageDays(app.db, orgId, monthOf(now))).map((d) => ({ ...d, gb: round(d.bytes / BYTES_PER_GB, 4) }));
  const { elapsed, total } = monthProgress(now);
  const projectedGb = (state.monthGb / elapsed) * total;
  const cost = (gb: number) => (limits.plan.overage && included !== null ? overageCents(gb - included) / 100 : 0);
  return {
    billing: app.billing.on,
    plan: planView(limits.plan),
    includedGb: included,
    maxRetentionDays: limits.maxRetentionDays,
    month: monthOf(now),
    monthGb: round(state.monthGb),
    days,
    overageUsd: round(cost(state.monthGb), 2),
    projectedGb: round(projectedGb, 1),
    projectedOverageUsd: round(cost(projectedGb), 2),
    spendCapUsd: state.billing.spendCapCents === null ? null : state.billing.spendCapCents / 100,
    blocked: state.blocked,
    reason: state.reason,
    subscription: app.billing.on ? await subscriptionOf(app, orgId) : null,
    plans: app.billing.on ? (["free", "team", "business", "enterprise"] as PlanId[]).map((id) => planView(PLANS[id])) : [],
  };
}
