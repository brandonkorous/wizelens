import { type ReactNode, useState } from "react";
import { loadAccount, type Project } from "../../data/account";
import { apiSend } from "../../data/api";
import { eachOne, eachText } from "../../data/bulk";
import { useAsk } from "../../ui/Dialog";
import { PartsProgress } from "../../ui/OneTimeSecrets";
import { SelectionBar, useSelection } from "../../ui/Selection";
import type { TableSelect } from "../../ui/Table";

type Action = "clear" | "delete";

const WORDS: Record<Action, { title: string; body: string; button: string; verb: string }> = {
  clear: { title: "Clear the data of", body: "Every trace, log, and metric of these projects is deleted. Their keys and alerts stay.", button: "Clear data", verb: "Cleared" },
  delete: { title: "Delete", body: "The projects, their data, their keys, and their alerts are deleted. Apps that send with their keys stop being recorded.", button: "Delete projects", verb: "Deleted" },
};

/** Boxes on the projects, and the bar that clears or deletes the picked ones. Both cannot be undone, so you type what you are doing first. */
export function useProjectsBulk(orgId: string, projects: Project[], reload: () => void, onDone: (error: string | null) => void): { select: TableSelect; bar: ReactNode } {
  const { picked, select, clear } = useSelection(projects.map((p) => p.id), "project");
  const [done, setDone] = useState<number | null>(null);
  const { dialog, confirm } = useAsk();
  const chosen = projects.filter((p) => picked.includes(p.id));
  const n = chosen.length;
  const run = async (action: Action) => {
    const w = WORDS[action];
    const what = `${w.button.toLowerCase().split(" ")[0]} ${n}`;
    if (!(await confirm({ title: `${w.title} ${n} ${n === 1 ? "project" : "projects"}?`, body: w.body, confirmLabel: w.button, danger: true, typeToConfirm: what }))) return;
    setDone(0);
    const send = (p: Project) => (action === "delete" ? apiSend("DELETE", `./api/orgs/${orgId}/projects/${p.id}`) : apiSend("POST", `./api/orgs/${orgId}/projects/${p.id}/clear`));
    const out = await eachOne(chosen, send, setDone);
    setDone(null);
    clear();
    reload();
    void loadAccount();
    onDone(eachText(out, n, w.verb, (p) => p.name));
  };
  const bar = (
    <>
      <SelectionBar count={n} noun="project" onClear={clear}>
        <button type="button" className="wl-btn" disabled={done !== null} onClick={() => void run("clear")}>Clear data</button>
        <button type="button" className="wl-btn wl-btn-danger" disabled={done !== null} onClick={() => void run("delete")}>Delete</button>
      </SelectionBar>
      {done !== null && <div className="wl-panel-banner"><PartsProgress done={done} total={n} what="Done with" /></div>}
      {dialog}
    </>
  );
  return { select, bar };
}
