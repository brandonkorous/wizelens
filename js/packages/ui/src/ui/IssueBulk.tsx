import { type ReactNode, useState } from "react";
import type { IssueKind } from "@wizeworks/lens-core/internal";
import { changeIssues, useIssueMembers } from "../data/issues";
import { useHost } from "../data/host";
import { Select } from "./Controls";
import { SelectionBar, useSelection } from "./Selection";
import type { TableSelect } from "./Table";

const HOUR = 3_600_000;
const FOR: [string, string][] = [[String(HOUR), "For 1 hour"], [String(24 * HOUR), "For 1 day"], [String(7 * 24 * HOUR), "For 1 week"], ["0", "For good"]];
const WORDS = { error: { noun: "error group", resolve: "Resolve", ignore: "Ignore" }, insight: { noun: "finding", resolve: "Mark fixed", ignore: "Dismiss" } } as const;

type Extra = { untilMs?: number | null; assignee?: string | null };

/** Tick boxes for an issue list, and the bar that resolves, ignores, reopens, or assigns the picked ones. Nothing on hosts that keep no issue states. */
export function useIssueBulk(kind: IssueKind, keys: readonly string[], noun: string = WORDS[kind].noun): { select: TableSelect | undefined; bar: ReactNode } {
  const { on, members } = useIssueMembers();
  const cloud = useHost().has("accounts");
  const { picked, select, clear } = useSelection(keys, noun);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!on) return { select: undefined, bar: null };
  const run = async (action: "resolve" | "ignore" | "reopen" | "assign", extra: Extra = {}) => {
    setBusy(true);
    const err = await changeIssues(cloud, kind, picked, action, extra);
    setBusy(false);
    setError(err);
    if (!err) clear();
  };
  const w = WORDS[kind];
  const people: [string, string][] = [["", "Assign to…"], ["-", "Nobody (unassign)"], ...members.map((m): [string, string] => [m.id, m.name || m.email])];
  const bar = (
    <>
      <SelectionBar count={picked.length} noun={noun} onClear={clear}>
        <button type="button" className="wl-btn" disabled={busy} onClick={() => void run("resolve")}>{w.resolve}</button>
        <Select small label={w.ignore} value="" options={[["", `${w.ignore}…`], ...FOR]} onChange={(v) => v !== "" && void run("ignore", { untilMs: v === "0" ? null : Date.now() + Number(v) })} />
        <button type="button" className="wl-btn" disabled={busy} onClick={() => void run("reopen")}>Reopen</button>
        {cloud && members.length > 0 && <Select small label="Assign" value="" options={people} onChange={(v) => v !== "" && void run("assign", { assignee: v === "-" ? null : v })} />}
      </SelectionBar>
      {error && <div className="wl-banner wl-banner-error wl-panel-banner">{error}</div>}
    </>
  );
  return { select, bar };
}
