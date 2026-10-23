import { useState } from "react";
import { BellRing } from "lucide-react";
import { useAccount, currentProject } from "../../data/account";
import { useHost } from "../../data/host";
import { alertHref, navigate } from "../../routes";
import { Select } from "../../ui/Controls";
import { useAsk } from "../../ui/Dialog";
import { Empty } from "../../ui/Panel";
import { ListFilter, matchesText, SelectionBar, useSelection } from "../../ui/Selection";
import { type Column, Table } from "../../ui/Table";
import { changeRules, type RuleAction } from "./alertBulk";
import type { AlertRule } from "./alertTypes";

const HOUR = 3_600_000;
const MUTES: [string, string][] = [["", "Mute…"], [String(HOUR), "For 1 hour"], [String(4 * HOUR), "For 4 hours"], [String(24 * HOUR), "For 1 day"], ["-1", "Until I unmute"]];

export interface RulesTableProps {
  rules: AlertRule[];
  columns: Column<AlertRule>[];
  canWrite: boolean;
  url: (path?: string, projectId?: string) => string;
  onDone: (error: string | null) => void;
}

/** The rules, with a filter and, for people who can change them, boxes to mute, unmute, turn on or off, or delete many at once. */
export function RulesTable({ rules, columns, canWrite, url, onDone }: RulesTableProps) {
  const cloud = useHost().has("accounts");
  const orgId = currentProject(useAccount())?.org.id ?? "";
  const [filter, setFilter] = useState("");
  const { picked, select, clear } = useSelection(rules.map((r) => r.id), "alert");
  const [busy, setBusy] = useState(false);
  const { dialog, confirm } = useAsk();
  const shown = rules.filter((r) => matchesText(filter, r.name, r.metric, r.service, r.endpoint, (r as { project?: string }).project));
  const chosen = rules.filter((r) => picked.includes(r.id));
  const run = async (action: RuleAction, untilMs: number | null = null) => {
    if (action === "delete" && !(await confirm({ title: `Delete ${chosen.length} ${chosen.length === 1 ? "alert" : "alerts"}?`, body: "They stop checking and their history is deleted.", confirmLabel: "Delete", danger: true }))) return;
    setBusy(true);
    const err = await changeRules(cloud, orgId, url, chosen, action, untilMs);
    setBusy(false);
    if (!err) clear();
    onDone(err);
  };
  return (
    <>
      {rules.length > 8 && <div className="wl-list-tools"><ListFilter value={filter} onChange={setFilter} placeholder="Filter alerts" /></div>}
      {canWrite && (
        <SelectionBar count={chosen.length} noun="alert" onClear={clear}>
          <Select small label="Mute" value="" options={MUTES} onChange={(v) => v && void run("mute", v === "-1" ? -1 : Date.now() + Number(v))} />
          <button type="button" className="wl-btn" disabled={busy} onClick={() => void run("unmute")}>Unmute</button>
          <button type="button" className="wl-btn" disabled={busy} onClick={() => void run("enable")}>Turn on</button>
          <button type="button" className="wl-btn" disabled={busy} onClick={() => void run("disable")}>Turn off</button>
          <button type="button" className="wl-btn wl-btn-danger" disabled={busy} onClick={() => void run("delete")}>Delete</button>
        </SelectionBar>
      )}
      <Table columns={columns} rows={shown} rowKey={(r) => r.id} select={canWrite ? select : undefined} onRowClick={(r) => navigate(alertHref(r.id, r.projectId))} empty={filter ? <Empty>No alert matches “{filter}”.</Empty> : <Empty title="No alerts yet"><BellRing aria-hidden="true" /> Add one to hear about problems before your users do.</Empty>} />
      {dialog}
    </>
  );
}
