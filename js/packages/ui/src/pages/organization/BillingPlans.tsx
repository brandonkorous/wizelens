import { useState } from "react";
import { Check } from "lucide-react";
import { cancelPlan, choosePlan, type Feature, fmtGb, fmtUsd, type PlanView, type Usage } from "../../data/billing";
import { errorText } from "../../data/account";
import { useAsk } from "../../ui/Dialog";
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

const LOST: Record<Feature, string> = {
  sso: "Single sign-on settings lock: people sign in with it as now, but you cannot change it or require it.",
  scim: "SCIM provisioning stops.",
  auditExport: "Audit log export stops; the log itself stays.",
};

/** What a lower plan takes away, in her words; null when nothing is lost. */
export function lossOf(usage: Usage, p: PlanView): string[] | null {
  const lost = (Object.keys(LOST) as Feature[]).filter((f) => usage.plan.features[f] && !p.features[f]).map((f) => LOST[f]);
  if (p.maxRetentionDays < usage.maxRetentionDays) lost.unshift(`Data is kept ${p.maxRetentionDays} days, not ${usage.maxRetentionDays}: older traces and logs are deleted.`);
  return lost.length ? lost : null;
}

type Run = (f: () => Promise<void>, p: PlanView) => void;

function PlanAction({ p, usage, orgId, annual, busy, run }: { p: PlanView; usage: Usage; orgId: string; annual: boolean; busy: boolean; run: Run }) {
  const current = usage.plan.id === p.id;
  const paidNow = usage.plan.id === "team" || usage.plan.id === "business";
  if (current) return <span className="wl-badge wl-badge-info">Current plan</span>;
  if (p.id === "enterprise") return <a className="wl-btn" href="mailto:hello@wizelens.com?subject=WizeLens%20Enterprise">Talk to us</a>;
  if (p.id === "free") return paidNow ? <button type="button" className="wl-btn" disabled={busy} onClick={() => run(() => cancelPlan(orgId), p)}>Move to Free</button> : null;
  const id = p.id as "team" | "business";
  return (
    <button type="button" className="wl-btn wl-btn-primary" disabled={busy} onClick={() => run(() => choosePlan(orgId, id, annual), p)}>
      {paidNow ? `Switch to ${p.name}` : `Choose ${p.name}`}
    </button>
  );
}

/** The four plans side by side, monthly or yearly (10 months' price for 12), with the way to each. */
export function PlanCards({ usage, orgId, manage }: { usage: Usage; orgId: string; manage: boolean }) {
  const [annual, setAnnual] = useState(usage.subscription?.interval === "year");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dialog, confirm } = useAsk();
  const run: Run = async (f, p) => {
    const lost = lossOf(usage, p);
    const body = lost && <ul className="wl-plan-loss">{lost.map((t) => <li key={t}>{t}</li>)}<li>Stripe shows the new price next.</li></ul>;
    if (lost && !(await confirm({ title: `Move to ${p.name}?`, body, confirmLabel: `Continue to ${p.name}`, danger: true }))) return;
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
      {dialog}
      <p className="wl-muted wl-small">Extra data on Team and Business, per month: $0.30 a GB for the first 500 GB above the included GB, $0.20 up to 2 TB, then $0.10. Never a seat fee.</p>
    </Panel>
  );
}
