import { type ReactNode, useState } from "react";
import { BellPlus, Target } from "lucide-react";
import type { SloInput, SloReport } from "@wizeworks/lens-core/internal";
import { apiSend } from "../../data/api";
import { useHost } from "../../data/host";
import { act, useApi } from "../../data/useApi";
import { fmtCount } from "../../format";
import { endpointHref, navigate, newAlertHref } from "../../routes";
import { Badge } from "../../ui/Badges";
import { DetailHead } from "../../ui/DetailHead";
import { useAsk } from "../../ui/Dialog";
import { Empty, Panel } from "../../ui/Panel";
import type { ChartOutage } from "../../ui/OutageBands";
import { TimeChart } from "../../ui/TimeChart";
import { SloForm } from "./SloForm";
import { chartOutages, SloOutages, useSloOutages } from "./SloOutages";
import { budgetTone, fmtBudget, fmtBurn, fmtSli, sloGoal, useSlosApi } from "./sloTypes";

/** Google's fast-burn page: 14.4× over an hour spends 2% of a 30-day budget. */
const FAST_BURN = "14.4";

function Charts({ r, outages }: { r: SloReport; outages: ChartOutage[] }) {
  const s = r.status;
  const pct = (v: number) => `${Math.round(v)}%`;
  return (
    <div className="wl-grid wl-grid-2-even">
      <Panel title="Error Budget Used (over 100% is over budget)">
        <TimeChart starts={s.starts} format={pct} zoom={false} releases={false} outages={outages} lines={[{ label: "Budget used", values: s.budgetSeries.map((v) => (v === null ? null : (1 - v) * 100)), color: "var(--wl-blue)" }, { label: "All of it", values: s.starts.map(() => 100), color: "var(--wl-red)", dashed: true }]} />
      </Panel>
      <Panel title="Good Requests">
        <TimeChart starts={s.starts} format={(v) => fmtSli(v, r.slo.target)} zoom={false} outages={outages} lines={[{ label: "Good", values: s.sliSeries, color: "var(--wl-green)" }, { label: "Target", values: s.starts.map(() => r.slo.target), color: "var(--wl-red)", dashed: true }]} />
      </Panel>
    </div>
  );
}

function Body({ r, url, canWrite, reload }: { r: SloReport; url: string; canWrite: boolean; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const alerts = useHost().has("alerts");
  const outages = useSloOutages(r);
  const s = r.status;
  const stats: [string, ReactNode][] = [["Goal", sloGoal(r.slo)], ["Now", fmtSli(s.sli, r.slo.target)], ["Requests", fmtCount(s.total)], ["Burn now", `${fmtBurn(r.burn1h)} (1 h), ${fmtBurn(r.burn6h)} (6 h)`]];
  const save = async (input: SloInput) => {
    const err = await act(() => apiSend("PATCH", url, input), reload);
    if (!err) setEditing(false);
    return err;
  };
  const { dialog, confirm } = useAsk();
  const remove = async () =>
    (await confirm({ title: `Delete ${r.slo.name}?`, body: "Its budget history and any alert on its burn rate stop working.", confirmLabel: "Delete SLO", danger: true })) &&
    void act(() => apiSend("DELETE", url), () => navigate("#/slos"));
  const alertHref = newAlertHref({ metric: "slo", sloId: r.slo.id, op: ">", threshold: FAST_BURN, windowMs: "3600000", name: `${r.slo.name} burns fast` });
  const actions = (
    <>
      {alerts && <a className="wl-btn wl-btn-sm" href={alertHref}><BellPlus aria-hidden="true" /> Alert on burn rate</a>}
      {canWrite && <button type="button" className="wl-btn wl-btn-sm" onClick={() => setEditing(true)}>Edit</button>}
      {canWrite && <button type="button" className="wl-link-btn wl-text-error" onClick={() => void remove()}>Delete</button>}
      {dialog}
    </>
  );
  const scope = r.slo.endpoint ? endpointHref(`api:${r.slo.service}`, r.slo.endpoint) : `#/services/api%3A${encodeURIComponent(r.slo.service)}`;
  return (
    <>
      <DetailHead back={["#/slos", "All SLOs"]} icon={Target} title={r.slo.name} badge={<Badge tone={budgetTone(s.budgetLeft)}>{s.budgetLeft !== null && s.budgetLeft > 0 ? `${fmtBudget(s.budgetLeft)} of budget left` : fmtBudget(s.budgetLeft)}</Badge>} actions={actions} stats={[...stats, ["Covers", <a key="s" href={scope}>{r.slo.endpoint || r.slo.service}</a>]]} />
      <SloOutages r={r} outages={outages} />
      {editing && <SloForm title={`Edit "${r.slo.name}"`} initial={r.slo} onSave={save} onCancel={() => setEditing(false)} />}
      <Charts r={r} outages={chartOutages(outages)} />
    </>
  );
}

/** One SLO: its goal, the budget it has left and how it moved, and how fast it burns now. */
export function SloPage({ id }: { id: string }) {
  const api = useSlosApi();
  const url = api.url(`/${encodeURIComponent(id)}`);
  const { data, error, reload } = useApi<SloReport>(api.ready ? url : null);
  if (error) return <Panel><Empty title="This SLO was not found">{error} Go back to <a href="#/slos">all SLOs</a>.</Empty></Panel>;
  return <div className="wl-dpage">{data ? <Body r={data} url={url} canWrite={api.canWrite} reload={reload} /> : <Panel><Empty>Loading…</Empty></Panel>}</div>;
}
