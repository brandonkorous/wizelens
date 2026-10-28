import { useState } from "react";
import { Check } from "lucide-react";
import { cancelPlan, choosePlan, fmtGb, fmtUsd, type PlanView, type Usage } from "../../data/billing";
import { errorText } from "../../data/account";
import { Panel } from "../../ui/Panel";

const PERKS: Record<string, string[]> = {
  free: ["Unlimited users", "Alerts, MCP, and share links", "Stops at the included data"],
  team: ["Everything in Free", "Extra data billed per GB, no hard stop", "Optional spend cap"],
  business: ["Everything in Team", "SAML and OIDC single sign-on, required if you choose", "SCIM provisioning and audit log export"],
  enterprise: ["Data, retention, and SLA set with us", "Data residency and BAA", "Up to 400 days of data"],
};

function price(p: PlanView, annual: boolean): string {
  if (p.monthlyUsd === null) return "Custom";
  if (p.monthlyUsd === 0) return "$0";
  return annual ? `${fmtUsd(p.annualUsd! / 12)}/mo` : `${fmtUsd(p.monthlyUsd)}/mo`;
}

function PlanAction({ p, usage, orgId, annual, busy, run }: { p: PlanView; usage: Usage; orgId: string; annual: boolean; busy: boolean; run: (f: () => Promise<void>) => void }) {
  const current = usage.plan.id === p.id;
  const paidNow = usage.plan.id === "team" || usage.plan.id === "business";
  if (current) return <span className="wl-badge wl-badge-info">Current plan</span>;
  if (p.id === "enterprise") return <a className="wl-btn" href="mailto:hello@wizelens.com?subject=WizeLens%20Enterprise">Talk to us</a>;
  if (p.id === "free") return paidNow ? <button type="button" className="wl-btn" disabled={busy} onClick={() => run(() => cancelPlan(orgId))}>Move to Free</button> : null;
  const id = p.id as "team" | "business";
  return (
    <button type="button" className="wl-btn wl-btn-primary" disabled={busy} onClick={() => run(() => choosePlan(orgId, id, annual))}>
      {paidNow ? `Switch to ${p.name}` : `Choose ${p.name}`}
    </button>
  );
}

/** The four plans side by side, monthly or yearly (10 months' price for 12), with the way to each. */
export function PlanCards({ usage, orgId, manage }: { usage: Usage; orgId: string; manage: boolean }) {
  const [annual, setAnnual] = useState(usage.subscription?.interval === "year");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (f: () => Promise<void>) => {
    setBusy(true);
    f().catch((e: unknown) => (setError(errorText(e)), setBusy(false)));
  };
  const toggle = (
    <div className="wl-segmented" role="group" aria-label="Billing period">
      <button type="button" aria-pressed={!annual} className={annual ? "" : "wl-active"} onClick={() => setAnnual(false)}>Monthly</button>
      <button type="button" aria-pressed={annual} className={annual ? "wl-active" : ""} onClick={() => setAnnual(true)}>Yearly, 2 months free</button>
    </div>
  );
  return (
    <Panel title="Plans" action={toggle}>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      <div className="wl-plans">
        {usage.plans.map((p) => (
          <article key={p.id} className={`wl-plan${usage.plan.id === p.id ? " wl-plan-current" : ""}`}>
            <h3>{p.name}</h3>
            <div className="wl-plan-price">{price(p, annual)}</div>
            <p className="wl-muted wl-small">{p.includedGb === null ? "Data set with us" : `${fmtGb(p.includedGb)} a month`} · {p.maxRetentionDays} days of data</p>
            <ul>{(PERKS[p.id] ?? []).map((t) => <li key={t}><Check aria-hidden="true" /> {t}</li>)}</ul>
            {manage && <PlanAction p={p} usage={usage} orgId={orgId} annual={annual} busy={busy} run={run} />}
          </article>
        ))}
      </div>
      <p className="wl-muted wl-small">Extra data on Team and Business, per month: $0.30 a GB for the first 500 GB above the included GB, $0.20 up to 2 TB, then $0.10. Never a seat fee.</p>
    </Panel>
  );
}
