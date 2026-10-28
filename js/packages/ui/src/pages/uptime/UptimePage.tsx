import { useState } from "react";
import { Bell, HeartPulse, Plus } from "lucide-react";
import type { UptimeCheckView } from "@wizeworks/lens-core";
import { useHost } from "../../data/host";
import { usePageModel } from "../../data/models";
import { type UptimeApi, useUptime } from "../../data/uptime";
import { hrefTo, useRoute } from "../../routes";
import { type AskOptions, useAsk } from "../../ui/Dialog";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { deleteCheck } from "./uptimeParts";
import { CheckDetail } from "./CheckDetail";
import { CheckForm } from "./CheckForm";
import { IncidentsPanel } from "./IncidentsPanel";
import { StatusPagePanel } from "./StatusPagePanel";
import { CertWarnings, UptimeCards } from "./UptimeCards";
import { ChecksTable } from "./UptimeTable";
import { useChecksBulk } from "./ChecksBulk";
import { ImportChecks } from "./ImportChecks";
import { ImportButton } from "../../ui/Sections";
import "../../styles/pages/uptime.css";
import { useTargetProject } from "../../ui/ProjectSelect";

/** A new alert that fires when any check fails, filled in on the Alerts page. */
const ALERT_HREF = hrefTo("alerts", [], { new: "1", name: "A site is down", metric: "uptime_failing", op: ">", threshold: "0", windowMs: "300000" });

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

/** Row actions: run now, edit, and delete (after asking), each with a note after. */
function actionsOf(api: UptimeApi, onEdit: (c: UptimeCheckView) => void, setNote: (err: string | null, ok?: string) => void, confirm: (o: AskOptions) => Promise<boolean>) {
  return {
    onRun: (c: UptimeCheckView) => void api.runNow(c.id).then((e) => setNote(e, `Ran ${c.name}.`)),
    onEdit,
    onDelete: async (c: UptimeCheckView) => (await confirm(deleteCheck(c.name))) && void api.remove(c.id).then((e) => setNote(e, `Deleted ${c.name}.`)),
  };
}

function UptimeList() {
  const api = useUptime();
  const target = useTargetProject();
  const { model } = usePageModel("uptime");
  const [editing, setEditing] = useState<UptimeCheckView | "new" | null>(null);
  const [note, setNote] = useNote();
  const checks = api.data?.checks ?? [];
  const { dialog, confirm } = useAsk();
  const actions = actionsOf(api, setEditing, setNote, confirm);
  const save = async (draft: Parameters<UptimeApi["save"]>[0]) => {
    const err = await api.save(draft, editing === "new" || !editing ? undefined : editing.id, target.id ?? undefined);
    if (!err) setEditing(null);
    return err;
  };
  const [importing, setImporting] = useState(false);
  const bulk = useChecksBulk(api, checks, setNote);
  const alerts = useHost().has("alerts");
  const add = api.canWrite && (
    <>
      {alerts && <a className="wl-btn" href={ALERT_HREF}><Bell aria-hidden="true" /> Alert me when one fails</a>}
      <ImportButton label="Import URLs" onOpen={() => setImporting(true)} />
      <button type="button" className="wl-btn wl-btn-primary" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> New check</button>
    </>
  );
  return (
    <>
      <PageHeader title="Uptime" subtitle={SUBTITLE}>{add}</PageHeader>
      {dialog}
      {api.error && <div className="wl-banner wl-banner-error">{api.error}</div>}
      {note && <div className="wl-banner wl-banner-info">{note}</div>}
      <CertWarnings checks={checks} nowMs={api.data?.nowMs ?? Date.now()} />
      {editing && <CheckForm initial={editing === "new" ? null : editing} lead={editing === "new" && target.field} onSave={save} onCancel={() => setEditing(null)} />}
      <UptimeCards checks={checks} model={model} />
      {importing && <ImportChecks api={api} lead={target.field} projectId={target.id ?? undefined} onClose={() => setImporting(false)} />}
      <Panel title="Checks" flush>
        {bulk.bar}
        <ChecksTable select={bulk.select} checks={checks} model={model} nowMs={api.data?.nowMs ?? Date.now()} canWrite={api.canWrite} {...actions} empty={<Empty title="No checks yet"><HeartPulse aria-hidden="true" /> Add one to hear when a site or API stops answering.</Empty>} />
      </Panel>
      <IncidentsPanel incidents={api.data?.incidents ?? []} nowMs={api.data?.nowMs ?? Date.now()} />
      <StatusPagePanel />
    </>
  );
}
