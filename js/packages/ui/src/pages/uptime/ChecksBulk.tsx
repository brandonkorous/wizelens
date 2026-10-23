import { type ReactNode, useState } from "react";
import type { UptimeCheckView } from "@wizeworks/lens-core";
import { eachOne, eachText } from "../../data/bulk";
import type { UptimeApi } from "../../data/uptime";
import { useAsk } from "../../ui/Dialog";
import { SelectionBar, useSelection } from "../../ui/Selection";
import type { TableSelect } from "../../ui/Table";

type Action = "pause" | "resume" | "run" | "delete";

/** Boxes on the checks, and the bar that pauses, resumes, runs, or deletes the picked ones. */
export function useChecksBulk(api: UptimeApi, checks: readonly UptimeCheckView[], onDone: (note: string) => void): { select: TableSelect | undefined; bar: ReactNode } {
  const { picked, select, clear } = useSelection(checks.map((c) => c.id), "check");
  const [busy, setBusy] = useState(false);
  const { dialog, confirm } = useAsk();
  if (!api.canWrite) return { select: undefined, bar: null };
  const chosen = checks.filter((c) => picked.includes(c.id));
  const send: Record<Action, (c: UptimeCheckView) => Promise<unknown>> = {
    pause: (c) => api.quiet.patch(c.id, { enabled: false }),
    resume: (c) => api.quiet.patch(c.id, { enabled: true }),
    run: (c) => api.quiet.run(c.id),
    delete: (c) => api.quiet.remove(c.id),
  };
  const run = async (action: Action) => {
    if (action === "delete" && !(await confirm({ title: `Delete ${chosen.length} ${chosen.length === 1 ? "check" : "checks"}?`, body: "They stop running, and their history and incidents are deleted.", confirmLabel: "Delete", danger: true }))) return;
    setBusy(true);
    const out = await eachOne(chosen, send[action]);
    setBusy(false);
    clear();
    api.reload();
    onDone(eachText(out, chosen.length, "Changed", (c) => c.name) ?? `Done: ${out.done.length} ${out.done.length === 1 ? "check" : "checks"}.`);
  };
  const bar = (
    <>
      <SelectionBar count={chosen.length} noun="check" onClear={clear}>
        <button type="button" className="wl-btn" disabled={busy} onClick={() => void run("run")}>Run now</button>
        <button type="button" className="wl-btn" disabled={busy} onClick={() => void run("pause")}>Pause</button>
        <button type="button" className="wl-btn" disabled={busy} onClick={() => void run("resume")}>Resume</button>
        <button type="button" className="wl-btn wl-btn-danger" disabled={busy} onClick={() => void run("delete")}>Delete</button>
      </SelectionBar>
      {dialog}
    </>
  );
  return { select, bar };
}
