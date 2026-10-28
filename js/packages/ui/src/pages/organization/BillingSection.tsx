import { type FormEvent, useState } from "react";
import { CreditCard } from "lucide-react";
import { errorText, type OrgWithProjects } from "../../data/account";
import { openPortal, setSpendCap, type Usage, useUsage } from "../../data/billing";
import { act } from "../../data/useApi";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { PlanCards } from "./BillingPlans";
import { UsagePanel } from "./BillingUsage";

/** Owners stop extra data at a monthly limit; past it, ingest pauses like the Free cap. Empty means no limit. */
// The note lives in BillingSection: saving reloads the usage, and the new cap remounts this form.
function SpendCap({ orgId, usage, reload, note, setNote }: { orgId: string; usage: Usage; reload: () => void; note: string | null; setNote: (n: string | null) => void }) {
  const [value, setValue] = useState(usage.spendCapUsd === null ? "" : String(usage.spendCapUsd));
  const save = (e: FormEvent) => {
    e.preventDefault();
    const usd = value.trim() === "" ? null : Number(value);
    const done = usd === null ? "Saved. No limit: extra data is billed as it is used." : `Saved. Extra data stops at $${usd} a month; after that new data is refused until the 1st.`;
    void act(() => setSpendCap(orgId, usd), reload).then((err) => setNote(err ?? done));
  };
  return (
    <Panel title="Spend cap">
      <p className="wl-muted wl-settings-note">The most extra data may cost in a month. When it is reached, new data is refused until the 1st, so the bill never surprises you.</p>
      <form className="wl-form" onSubmit={save}>
        <FormRow>
          <Field label="Monthly limit for extra data (USD)" narrow type="number" min={0} step={1} value={value} onChange={(e) => setValue(e.target.value)} placeholder="No limit" />
          <button type="submit" className="wl-btn wl-btn-primary">Save</button>
        </FormRow>
        {note && <p className="wl-muted wl-small" role="status">{note}</p>}
      </form>
    </Panel>
  );
}

function ManageBilling({ orgId }: { orgId: string }) {
  const [error, setError] = useState<string | null>(null);
  const open = () => void openPortal(orgId).catch((e: unknown) => setError(errorText(e)));
  return (
    <>
      <button type="button" className="wl-btn" onClick={open}><CreditCard aria-hidden="true" /> Manage billing</button>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
    </>
  );
}

/** Owners and admins on a cloud with billing: the plan, this month's data, plans to change to, the Stripe portal, and the spend cap. */
export function BillingSection({ org }: { org: OrgWithProjects }) {
  const { data: usage, error, reload } = useUsage(org.id);
  const [capNote, setCapNote] = useState<string | null>(null);
  const paid = usage?.plan.id === "team" || usage?.plan.id === "business";
  const status = usage?.subscription?.status === "past_due" ? " The last payment failed; Stripe retries it, and the plan stays until the retries end." : "";
  return (
    <>
      <SectionHead
        title="Billing"
        description={usage ? `${org.name} is on the ${usage.plan.name} plan.${status}` : "Your plan and this month's data."}
        action={paid && <ManageBilling orgId={org.id} />}
      />
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {paid && (
        <p className="wl-muted wl-settings-note">
          Manage billing opens Stripe for your card, address, and invoices. Stripe lists two subscriptions: the {usage.plan.name} plan, and extra data, billed on the 1st for any GB above the {usage.includedGb ?? 0} GB included. To stop paying, use Move to Free below; extra data alone cannot be canceled while the plan runs.
        </p>
      )}
      {usage && <UsagePanel usage={usage} />}
      {usage && <PlanCards usage={usage} orgId={org.id} manage />}
      {usage && paid && org.role === "owner" && <SpendCap key={String(usage.spendCapUsd)} orgId={org.id} usage={usage} reload={reload} note={capNote} setNote={setCapNote} />}
    </>
  );
}
