import { useState } from "react";
import { isMuted, MUTED_FOREVER } from "@wizeworks/lens-core";
import { apiSend } from "../../data/api";
import { fmtDateTime } from "../../format";
import { Badge, DotText } from "../../ui/Badges";
import { Select } from "../../ui/Controls";
import type { AlertRule } from "./alertTypes";

const HOUR = 3_600_000;
const MUTES: [string, string][] = [["", "Mute…"], [String(HOUR), "For 1 hour"], [String(4 * HOUR), "For 4 hours"], [String(24 * HOUR), "For 1 day"], ["-1", "Until I unmute"]];

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
  /** The rule's API address: `url("/<id>/mute")`. */
  url: (path?: string) => string;
  onDone: (note?: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** Acknowledge, mute or unmute, turn on or off, test, edit, and delete. */
export function RuleActions({ rule, url, onDone, onEdit, onDelete }: RuleActionsProps) {
  const [busy, setBusy] = useState(false);
  const run = (method: "POST" | "PATCH", path: string, body?: unknown, note?: (x: unknown) => string) => {
    setBusy(true);
    void apiSend(method, url(path), body).then(
      (x) => (setBusy(false), onDone(note?.(x))),
      (e: unknown) => (setBusy(false), onDone(e instanceof Error ? e.message : String(e))),
    );
  };
  const id = `/${encodeURIComponent(rule.id)}`;
  const muted = isMuted(rule, Date.now());
  return (
    <span className="wl-row-actions wl-alert-actions" onClick={(e) => e.stopPropagation()}>
      {rule.state === "firing" && rule.ackMs === null && <button type="button" className="wl-link-btn" disabled={busy} onClick={() => run("POST", `${id}/ack`)}>Acknowledge</button>}
      {muted ? (
        <button type="button" className="wl-link-btn" disabled={busy} onClick={() => run("POST", `${id}/mute`, { untilMs: null })}>Unmute</button>
      ) : (
        <Select small label="Mute" value="" options={MUTES} onChange={(v) => v && run("POST", `${id}/mute`, { untilMs: v === "-1" ? -1 : Date.now() + Number(v) })} />
      )}
      <button type="button" className="wl-link-btn" disabled={busy} onClick={() => run("PATCH", id, { enabled: !rule.enabled })}>{rule.enabled ? "Turn off" : "Turn on"}</button>
      <button type="button" className="wl-link-btn" disabled={busy} onClick={() => run("POST", `${id}/test`, undefined, (x) => `Test sent: ${(x as { delivery: string }).delivery}`)}>Test</button>
      {onEdit && <button type="button" className="wl-link-btn" onClick={onEdit}>Edit</button>}
      {onDelete && <button type="button" className="wl-link-btn wl-text-error" onClick={onDelete}>Delete</button>}
    </span>
  );
}
