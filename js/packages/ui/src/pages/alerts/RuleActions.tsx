import { useState } from "react";
import { isMuted, MUTED_FOREVER } from "@wizeworks/lens-core";
import { apiSend } from "../../data/api";
import { fmtDateTime } from "../../format";
import { Badge, DotText } from "../../ui/Badges";
import { Select } from "../../ui/Controls";
import { useAsk } from "../../ui/Dialog";
import type { AlertRule } from "./alertTypes";
import type { InProject } from "../../data/projectScope";

const HOUR = 3_600_000;
const MUTES: [string, string][] = [[String(HOUR), "Mute for 1 hour"], [String(4 * HOUR), "Mute for 4 hours"], [String(24 * HOUR), "Mute for 1 day"], ["-1", "Mute until I unmute"]];

/** The rarer actions of a rule, in one picker: mute (when not muted), turn on or off, test, delete. */
const moreOptions = (rule: AlertRule, muted: boolean): [string, string][] => [
  ["", "More…"],
  ...(muted ? [] : MUTES),
  ["toggle", rule.enabled ? "Turn off" : "Turn on"],
  ["test", "Send a test"],
  ["delete", "Delete…"],
];

/** Off, muted, firing (and acknowledged), or OK. */
export function RuleState({ rule }: { rule: AlertRule }) {
  const now = Date.now();
  if (!rule.enabled) return <Badge tone="neutral">Off</Badge>;
  const muted = isMuted(rule, now) && (
    <Badge tone="neutral">{rule.mutedUntilMs === MUTED_FOREVER ? "Muted" : `Muted until ${fmtDateTime(rule.mutedUntilMs!)}`}</Badge>
  );
  const state = <DotText tone={rule.state === "firing" ? "danger" : "success"} colorText={rule.state === "firing"}>{rule.state === "firing" ? "Firing" : "OK"}</DotText>;
  return (
    <span className="wl-alert-state">
      {state}
      {rule.state === "firing" && rule.ackMs !== null && <Badge tone="info">Acknowledged</Badge>}
      {muted}
    </span>
  );
}

export interface RuleActionsProps {
  rule: AlertRule;
  /** The rule's API address: `url("/<id>/mute")`, in its own project under "All projects". */
  url: (path?: string, projectId?: string) => string;
  onDone: (note?: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** The urgent action (Acknowledge, Unmute) and Edit on the row; mute, turn off, test and delete under More. */
export function RuleActions({ rule, url, onDone, onEdit, onDelete }: RuleActionsProps) {
  const [busy, setBusy] = useState(false);
  const { dialog, confirm } = useAsk();
  const remove = async () => (await confirm({ title: `Delete ${rule.name}?`, body: "It stops checking and sends nothing more. This cannot be undone.", confirmLabel: "Delete alert", danger: true })) && onDelete?.();
  const run = (method: "POST" | "PATCH", path: string, body?: unknown, note?: (x: unknown) => string) => {
    setBusy(true);
    void apiSend(method, url(path, (rule as InProject<AlertRule>).projectId), body).then(
      (x) => (setBusy(false), onDone(note?.(x))),
      (e: unknown) => (setBusy(false), onDone(e instanceof Error ? e.message : String(e))),
    );
  };
  const id = `/${encodeURIComponent(rule.id)}`;
  const muted = isMuted(rule, Date.now());
  const more = (v: string) => {
    if (v === "toggle") return run("PATCH", id, { enabled: !rule.enabled }, () => (rule.enabled ? `${rule.name} is off.` : `${rule.name} is on.`));
    if (v === "test") return run("POST", `${id}/test`, undefined, (x) => `Test sent: ${(x as { delivery: string }).delivery}`);
    if (v === "delete") return void remove();
    if (v) run("POST", `${id}/mute`, { untilMs: v === "-1" ? -1 : Date.now() + Number(v) });
  };
  return (
    <span className="wl-row-actions wl-alert-actions" onClick={(e) => e.stopPropagation()}>
      {rule.state === "firing" && rule.ackMs === null && <button type="button" className="wl-link-btn" disabled={busy} onClick={() => run("POST", `${id}/ack`)}>Acknowledge</button>}
      {muted && <button type="button" className="wl-link-btn" disabled={busy} onClick={() => run("POST", `${id}/mute`, { untilMs: null })}>Unmute</button>}
      {onEdit && <button type="button" className="wl-link-btn" onClick={onEdit}>Edit</button>}
      <Select small label={`More actions for ${rule.name}`} value="" options={moreOptions(rule, muted).filter(([v]) => v !== "delete" || onDelete)} onChange={more} />
      {dialog}
    </span>
  );
}
