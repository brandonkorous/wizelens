import { type FormEvent, useState } from "react";
import { useOnce } from "../../ui/useOnce";
import { LayoutDashboard, Plus } from "lucide-react";
import type { SavedItem } from "@wizeworks/lens-core/internal";
import { useHost } from "../../data/host";
import { changeSaved, useSavedApi, useSavedItems } from "../../data/saved";
import { fmtAgo } from "../../format";
import { dashboardHref, decodeParam, navigate, useRoute } from "../../routes";
import { Badge } from "../../ui/Badges";
import { Check, Field, FormRow } from "../../ui/Field";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { DashboardView } from "./DashboardView";
import "../../styles/pages/dashboards.css";

const COLUMNS: Column<SavedItem>[] = [
  { key: "name", header: "Dashboard", cell: (d) => <strong>{d.name}</strong> },
  { key: "charts", header: "Charts", num: true, cell: (d) => d.panels.length },
  { key: "shared", header: "", srHeader: "Shared with", cell: (d) => (d.shared ? <Badge tone="info">Shared with the team</Badge> : <Badge tone="neutral">Only you</Badge>) },
  { key: "by", header: "Made by", cell: (d) => d.ownerName || "–" },
  { key: "updated", header: "Changed", className: "wl-nowrap", cell: (d) => fmtAgo(d.updatedMs) },
];

function NewDashboard({ onDone }: { onDone: () => void }) {
  const api = useSavedApi();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { busy, once } = useOnce();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    once(() => changeSaved(api.url(), "POST", { kind: "dashboard", name, panels: [], shared: !api.cloud || shared }).then(
      (d) => (onDone(), d && navigate(dashboardHref(d.id))),
      (err: unknown) => setNote(err instanceof Error ? err.message : String(err)),
    ));
  };
  return (
    <Panel title="New dashboard">
      <form className="wl-form" onSubmit={submit}>
        <FormRow>
          <Field label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Runtime health" />
          {api.cloud && <Check label="Share with the team" checked={shared} onChange={(e) => setShared(e.target.checked)} />}
        </FormRow>
        {note && <div className="wl-banner wl-banner-error">{note}</div>}
        <FormRow>
          <button type="submit" className="wl-btn wl-btn-primary" disabled={busy}>Make it</button>
          <button type="button" className="wl-btn" onClick={onDone}>Cancel</button>
        </FormRow>
      </form>
    </Panel>
  );
}

function DashboardList() {
  const api = useSavedApi();
  const { items, error } = useSavedItems("dashboard");
  const [adding, setAdding] = useState(false);
  const add = api.canWrite && !adding && <button type="button" className="wl-btn wl-btn-primary" onClick={() => setAdding(true)}><Plus aria-hidden="true" /> New dashboard</button>;
  return (
    <>
      <PageHeader title="Dashboards" subtitle="Your own pages of metric charts: several metrics per chart, filtered and split by any attribute.">{add}</PageHeader>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {adding && <NewDashboard onDone={() => setAdding(false)} />}
      <Panel title="Dashboards" flush>
        <Table paging={{ noun: "dashboards", key: "dashboards" }} columns={COLUMNS} rows={items} rowKey={(d) => d.id} onRowClick={(d) => navigate(dashboardHref(d.id, d.projectId))} empty={<Empty title="No dashboards yet"><LayoutDashboard aria-hidden="true" /> Make one to put the metrics you watch on one page.</Empty>} />
      </Panel>
    </>
  );
}

/** Dashboards on hosts that keep them; one dashboard at `#/dashboards/<id>`. */
export function DashboardsPage() {
  const [id] = useRoute().params;
  if (!useHost().has("saved")) return <><PageHeader title="Dashboards" subtitle="Pages of metric charts." /><Panel><Empty title="This host keeps no dashboards">Dashboards run on the hub and on WizeLens Cloud.</Empty></Panel></>;
  return id ? <DashboardView key={id} id={decodeParam(id)} /> : <DashboardList />;
}
