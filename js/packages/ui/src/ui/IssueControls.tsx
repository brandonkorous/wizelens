import { useState } from "react";
import type { IssueInfo, IssueKind } from "@wizeworks/lens-core";
import { changeIssue, useIssueMembers } from "../data/issues";
import { useHost } from "../data/host";
import { Badge } from "./Badges";
import { Select } from "./Controls";

/** "New", "Regressed", "Resolved" (insights: "Fixed"), or "Ignored" (insights: "Dismissed"); nothing for a plain unresolved issue. */
export function IssueBadge({ info, kind = "error" }: { info: IssueInfo | undefined; kind?: IssueKind }) {
  if (!info) return null;
  if (info.status === "regressed") return <Badge tone="danger">Regressed</Badge>;
  if (info.status === "resolved") return <Badge tone="success">{kind === "insight" ? "Fixed" : "Resolved"}</Badge>;
  if (info.status === "ignored") return <Badge tone="neutral">{kind === "insight" ? "Dismissed" : "Ignored"}</Badge>;
  return info.isNew ? <Badge tone="info">New</Badge> : null;
}

const HOUR = 3_600_000;
const FOR: [string, string][] = [[String(HOUR), "For 1 hour"], [String(24 * HOUR), "For 1 day"], [String(7 * 24 * HOUR), "For 1 week"], ["0", "For good"]];
/** Insights say "Mark fixed" and "Dismiss"; error groups say "Resolve" and "Ignore". */
const WORDS = { error: ["Resolve", "Ignore"], insight: ["Mark fixed", "Dismiss"] } as const;

export interface IssueActionsProps {
  kind: IssueKind;
  issueKey: string;
  info: IssueInfo | undefined;
}

const STATES_DOCS = "https://wizelens.com/docs/errors/#resolve-ignore-and-assign";

/** Resolve, ignore (for a while or for good), reopen, and assign (cloud). Hosts that keep no issue states say where they are kept. */
export function IssueActions({ kind, issueKey, info }: IssueActionsProps) {
  const { on, members } = useIssueMembers();
  const host = useHost();
  const cloud = host.has("accounts");
  const [note, setNote] = useState<string | null>(null);
  const [resolve, ignore] = WORDS[kind];
  if (!host.has("issues")) return <p className="wl-issue-actions">{resolve} and {ignore} are on the hub and in the cloud, which keep these states. <a href={STATES_DOCS} target="_blank" rel="noreferrer">How</a></p>;
  if (!on) return null;
  const run = async (action: "resolve" | "ignore" | "reopen" | "assign", extra = {}) => setNote(await changeIssue(cloud, kind, issueKey, action, extra));
  const open = !info || info.status === "unresolved" || info.status === "regressed";
  const people: [string, string][] = [["", "Unassigned"], ...members.map((m): [string, string] => [m.id, m.name || m.email])];
  return (
    <div className="wl-issue-actions">
      {open ? (
        <>
          <button type="button" className="wl-btn" onClick={() => void run("resolve")}>{resolve}</button>
          <Select small label={ignore} value="" options={[["", `${ignore}…`], ...FOR]} onChange={(v) => v !== "" && void run("ignore", { untilMs: v === "0" ? null : Date.now() + Number(v) })} />
        </>
      ) : (
        <button type="button" className="wl-btn" onClick={() => void run("reopen")}>Reopen</button>
      )}
      {cloud && members.length > 0 && <Select small label="Assignee" value={info?.assignee ?? ""} options={people} onChange={(v) => void run("assign", { assignee: v || null })} />}
      {note && <span className="wl-text-error wl-small">{note}</span>}
    </div>
  );
}
