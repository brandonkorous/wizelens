import { useState } from "react";
import { ArrowDown, Plus, Target } from "lucide-react";
import type { SloInput, SloReport } from "@wizeworks/lens-core";
import { apiSend } from "../../data/api";
import { useHost } from "../../data/host";
import { act, useApi } from "../../data/useApi";
import { decodeParam, navigate, sloHref, useRoute } from "../../routes";
import { Badge } from "../../ui/Badges";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { ApdexTargets } from "./ApdexTargets";
import { EMPTY_SLO, SloForm } from "./SloForm";
import { SloPage } from "./SloPage";
import { budgetTone, fmtBudget, fmtBurn, fmtSli, sloGoal, type SlosData, useSlosApi } from "./sloTypes";
import "../../styles/pages/slos.css";
import { type InProject } from "../../data/projectScope";
import { PickProject } from "../../ui/PickProject";
import { useTargetProject } from "../../ui/ProjectSelect";
import { projectColumn } from "../../ui/ProjectColumn";

const COLUMNS: Column<SloReport>[] = [
  { key: "name", header: "SLO", cell: (r) => <strong>{r.slo.name}</strong> },
  { key: "goal", header: "Goal", className: "wl-wrap", cell: (r) => sloGoal(r.slo) },
  { key: "sli", header: "Now", num: true, cell: (r) => <span className={r.status.sli !== null && r.status.sli < r.slo.target ? "wl-text-error" : undefined}>{fmtSli(r.status.sli, r.slo.target)}</span> },
  { key: "budget", header: "Budget Left", num: true, cell: (r) => <Badge tone={budgetTone(r.status.budgetLeft)}>{fmtBudget(r.status.budgetLeft)}</Badge> },
  { key: "burn", header: "Burn (1 h / 6 h)", num: true, className: "wl-nowrap", cell: (r) => `${fmtBurn(r.burn1h)} / ${fmtBurn(r.burn6h)}` },
  { key: "total", header: "Requests", num: true, cell: (r) => r.status.total.toLocaleString() },
];

/** SLOs on hosts that keep them; elsewhere a note. One SLO's page at `#/slos/<id>`. */
export function SlosPage() {
  const [id] = useRoute().params;
  if (!useHost().has("slos")) {
    return (
      <>
        <PageHeader title="SLOs" subtitle="Service level objectives and error budgets." />
        <Panel><Empty title="This host keeps no SLOs">SLOs run on the hub and on WizeLens Cloud.</Empty></Panel>
      </>
    );
  }
  return id ? <SloPage key={id} id={decodeParam(id)} /> : <SloList />;
}

function SloList() {
  const api = useSlosApi();
  const { data, error, reload } = useApi<SlosData>(api.ready ? api.url() : null);
  const [adding, setAdding] = useState(false);
  const target = useTargetProject();
  const save = async (s: SloInput) => {
    const err = await act(() => apiSend("POST", api.url("", target.id ?? undefined), s), reload);
    if (!err) setAdding(false);
    return err;
  };
  const add = api.canWrite && !adding && <button type="button" className="wl-btn wl-btn-primary" onClick={() => setAdding(true)}><Plus aria-hidden="true" /> New SLO</button>;
  return (
    <>
      <PageHeader title="SLOs" subtitle="How much of your traffic must succeed, or be fast enough, and how much error budget is left.">
        {/* Apdex targets are the second part of this page; this takes you there. */}
        <button type="button" className="wl-btn" onClick={() => document.querySelector(".wl-apdex-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}><ArrowDown aria-hidden="true" /> Apdex targets</button>
        {add}
      </PageHeader>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {adding && target.field}
      {adding && <SloForm title="New SLO" initial={EMPTY_SLO} onSave={save} onCancel={() => setAdding(false)} />}
      <Panel title="Objectives" flush>
        <Table paging={{ noun: "SLOs", key: "slos" }} columns={[COLUMNS[0]!, ...projectColumn<SloReport>(), ...COLUMNS.slice(1)]} rows={data?.slos ?? []} rowKey={(r) => r.slo.id} onRowClick={(r) => navigate(sloHref(r.slo.id, (r as InProject<typeof r>).projectId))} empty={<Empty title="No SLOs yet"><Target aria-hidden="true" /> Add one to track an error budget for a service or an endpoint.</Empty>} />
      </Panel>
      {data && api.apdexUrl && <ApdexTargets targets={data.apdex} url={api.apdexUrl} canWrite={api.canWrite} onSaved={reload} />}
      {data && !api.apdexUrl && <Panel title="Apdex targets" className="wl-apdex-panel"><PickProject what="Apdex targets" /></Panel>}
    </>
  );
}
