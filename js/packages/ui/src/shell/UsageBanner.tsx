import { currentProject, useAccount } from "../data/account";
import { fmtGb, useUsage } from "../data/billing";
import { hrefTo } from "../routes";

/** A failed payment, for owners and admins: what still works and what to do. */
function PaymentBanner({ plan }: { plan: string }) {
  return (
    <div className="wl-banner wl-banner-warn wl-banner-thin" role="status">
      The last payment for the {plan} plan failed. Everything keeps working while Stripe tries again.{" "}
      <a href={hrefTo("organization", ["billing"])}>Update the card</a>
    </div>
  );
}

/** On a cloud with billing: ingest stopped, a failed payment (managers), or Free at 80% of its data. Managers get the way to Billing. */
export function UsageBanner() {
  const account = useAccount();
  const current = account?.billing ? currentProject(account) : null;
  const { data } = useUsage(current?.org.id ?? null);
  if (!current || !data?.billing) return null;
  const manage = current.org.role === "owner" || current.org.role === "admin";
  if (!data.blocked && manage && data.subscription?.status === "past_due") return <PaymentBanner plan={data.plan.name} />;
  if (data.includedGb === null) return null;
  const pct = (data.monthGb / data.includedGb) * 100;
  const free = data.plan.id === "free";
  if (!data.blocked && !(free && pct >= 80)) return null;
  const text = data.blocked ?? `${current.org.name} used ${Math.floor(pct)}% of the Free plan's ${fmtGb(data.includedGb)} this month. At 100%, new data is refused until the 1st.`;
  return (
    <div className={`wl-banner ${data.blocked ? "wl-banner-error" : "wl-banner-warn"} wl-banner-thin`} role="status">
      {text}{" "}
      {manage ? <a href={hrefTo("organization", ["billing"])}>{data.blocked && data.reason === "cap" ? "Change the spend cap" : "See plans"}</a> : <span>Ask an owner or admin to upgrade.</span>}
    </div>
  );
}
