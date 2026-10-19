import { useState } from "react";
import { HeartPulse, Plus } from "lucide-react";
import type { UptimeCheckView } from "@wizeworks/lens-core";
import { useHost } from "../../data/host";
import { usePageModel } from "../../data/models";
import { type UptimeApi, useUptime } from "../../data/uptime";
import { useRoute } from "../../routes";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { CheckDetail } from "./CheckDetail";
import { CheckForm } from "./CheckForm";
import { IncidentsPanel } from "./IncidentsPanel";
import { StatusPagePanel } from "./StatusPagePanel";
import { CertWarnings, UptimeCards } from "./UptimeCards";
import { ChecksTable } from "./UptimeTable";
import "../../styles/pages/uptime.css";

const SUBTITLE = "Checks that call your sites and APIs on a schedule, from this host. Results are requests of the wizelens-uptime service.";

/** The Uptime page on hosts that run checks; elsewhere a note. One check opens at `#/uptime/<id>`. */
export function UptimePage() {
  const id = useRoute().params[0];
  if (!useHost().has("uptime")) {
    return (
      <>
        <PageHeader title="Uptime" subtitle={SUBTITLE} />
        <Panel>
          <Empty title="This host does not run uptime checks">Uptime checks run on the local hub and on WizeLens Cloud.</Empty>
        </Panel>
      </>
    );
  }
  return id ? <CheckDetail id={id} /> : <UptimeList />;
}

/** The note after an action: an error, or a short success line. */
function useNote(): [string | null, (err: string | null, ok?: string) => void] {
  const [note, setNote] = useState<string | null>(null);
  return [note, (err, ok) => setNote(err ?? ok ?? null)];
}

/** Row actions: run now, edit, and delete, each with a note after. */
function actionsOf(api: UptimeApi, onEdit: (c: UptimeCheckView) => void, setNote: (err: string | null, ok?: string) => void) {
  return {
    onRun: (c: UptimeCheckView) => void api.runNow(c.id).then((e) => setNote(e, `Ran ${c.name}.`)),
    onEdit,
    onDelete: (c: UptimeCheckView) => void api.remove(c.id).then((e) => setNote(e, `Deleted ${c.name}.`)),
  };
}

function UptimeList() {
  const api = useUptime();
  const { model } = usePageModel("uptime");
  const [editing, setEditing] = useState<UptimeCheckView | "new" | null>(null);
  const [note, setNote] = useNote();
  const checks = api.data?.checks ?? [];
  const actions = actionsOf(api, setEditing, setNote);
  const save = async (draft: Parameters<UptimeApi["save"]>[0]) => {
    const err = await api.save(draft, editing === "new" || !editing ? undefined : editing.id);
    if (!err) setEditing(null);
    return err;
  };
  const add = api.canWrite && !editing && <button type="button" className="wl-btn wl-btn-primary" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> New check</button>;
  return (
    <>
      <PageHeader title="Uptime" subtitle={SUBTITLE}>{add}</PageHeader>
      {api.error && <div className="wl-banner wl-banner-error">{api.error}</div>}
      {note && <div className="wl-banner wl-banner-info">{note}</div>}
      <CertWarnings checks={checks} nowMs={api.data?.nowMs ?? Date.now()} />
      {editing && <CheckForm initial={editing === "new" ? null : editing} onSave={save} onCancel={() => setEditing(null)} />}
      <UptimeCards checks={checks} model={model} />
      <Panel title="Checks" flush>
        <ChecksTable checks={checks} model={model} nowMs={api.data?.nowMs ?? Date.now()} canWrite={api.canWrite} {...actions} empty={<Empty title="No checks yet"><HeartPulse aria-hidden="true" /> Add one to hear when a site or API stops answering.</Empty>} />
      </Panel>
      <IncidentsPanel incidents={api.data?.incidents ?? []} nowMs={api.data?.nowMs ?? Date.now()} />
      <StatusPagePanel />
    </>
  );
}
