import type { Queryable } from "../db/db.js";
import { audit } from "../repo/audit.js";
import { type OrgBilling, orgBilling } from "../repo/billing.js";
import { BYTES_PER_GB, type Limits, limitsOf, overageCents } from "./plans.js";
import { monthOf, type UsageMeter } from "./usage.js";

// Whether an organization may send more data this month: the Free cap and the optional spend cap on Team and Business.

const PLAN_TTL_MS = 60_000;

export interface UsageState {
  billing: OrgBilling;
  limits: Limits;
  monthGb: number;
  /** Why ingest is stopped, or null. */
  blocked: string | null;
  /** "free" or "cap" when blocked. */
  reason: "free" | "cap" | null;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** The block, if any, for a plan and this month's GB. */
export function blockOf(b: OrgBilling, limits: Limits, monthGb: number): Pick<UsageState, "blocked" | "reason"> {
  const included = limits.includedGb;
  if (limits.plan.id === "free" && included !== null && monthGb >= included) {
    return { reason: "free", blocked: `This organization reached the Free plan's ${included} GB for this month. Data is accepted again on the 1st (UTC), or upgrade on the Billing page.` };
  }
  if (limits.plan.overage && included !== null && b.spendCapCents !== null && overageCents(monthGb - included) >= b.spendCapCents) {
    return { reason: "cap", blocked: `This organization reached its monthly spend cap of ${usd(b.spendCapCents)}. Raise the cap on the Billing page, or data is accepted again on the 1st (UTC).` };
  }
  return { reason: null, blocked: null };
}

/** Plans cached for a minute per instance, so ingest does not read orgs on every call. */
export class Limiter {
  #plans = new Map<string, { b: OrgBilling; at: number }>();
  /** Blocks already written to the audit log, by "orgId|month|reason". */
  #logged = new Set<string>();

  constructor(
    private readonly db: Queryable,
    private readonly usage: UsageMeter,
    private readonly on: boolean,
    private readonly now: () => number,
  ) {}

  forget(orgId: string): void {
    this.#plans.delete(orgId);
  }

  async state(orgId: string): Promise<UsageState | null> {
    const hit = this.#plans.get(orgId);
    const b = hit && this.now() - hit.at < PLAN_TTL_MS ? hit.b : await orgBilling(this.db, orgId);
    if (!b) return null;
    if (!hit || hit.b !== b) this.#plans.set(orgId, { b, at: this.now() });
    const limits = limitsOf(b, this.on);
    const monthGb = (await this.usage.monthBytes(orgId)) / BYTES_PER_GB;
    return { billing: b, limits, monthGb, ...(this.on ? blockOf(b, limits, monthGb) : { blocked: null, reason: null }) };
  }

  /** The message for a 429 when ingest is stopped, else null. The first block of a month goes to the audit log. */
  async blocked(orgId: string): Promise<string | null> {
    if (!this.on) return null;
    const s = await this.state(orgId);
    if (!s?.blocked) return null;
    await this.#logOnce(orgId, s);
    return s.blocked;
  }

  async #logOnce(orgId: string, s: UsageState): Promise<void> {
    const month = monthOf(this.now());
    const key = `${orgId}|${month}|${s.reason}`;
    if (this.#logged.has(key)) return;
    this.#logged.add(key);
    const fresh = await this.db.query("INSERT INTO usage_notices (org_id, month, kind, sent_ms) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING org_id", [orgId, month, `blocked-${s.reason}`, this.now()]);
    if (fresh.length) await audit(this.db, orgId, "system", "ingest.blocked", { reason: s.reason, month, gb: Math.round(s.monthGb * 100) / 100 }, this.now());
  }
}
