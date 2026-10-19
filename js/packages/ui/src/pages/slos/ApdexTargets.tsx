import { useEffect, useState } from "react";
import { type ApdexTargets as Targets, DEFAULT_APDEX_MS } from "@wizeworks/lens-core";
import { apiSend } from "../../data/api";
import { usePageModel } from "../../data/models";
import { Field } from "../../ui/Field";
import { Panel } from "../../ui/Panel";

/** The Apdex target of each service that runs your code: requests at or under it are satisfied, under four times it tolerable. */
export function ApdexTargets({ targets, url, canWrite, onSaved }: { targets: Targets; url: string; canWrite: boolean; onSaved: () => void }) {
  const { model } = usePageModel("services");
  const names = [...new Set((model?.rows ?? []).filter((s) => s.kind === "api" || s.kind === "worker").map((s) => s.name))].sort();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setDraft(Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, String(v)]))), [targets]);
  const save = () => {
    const apdex = Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)]));
    void apiSend("PUT", url, { apdex }).then(
      () => (setNote("Saved."), onSaved()),
      (e: unknown) => setNote(e instanceof Error ? e.message : String(e)),
    );
  };
  return (
    <Panel title="Apdex Targets" action={canWrite && <button type="button" className="wl-btn wl-btn-sm" onClick={save}>Save targets</button>}>
      <p className="wl-muted wl-small">Requests at or under the target are satisfied, under four times it tolerable, and slower or failed ones frustrated. Empty uses {DEFAULT_APDEX_MS} ms.</p>
      <div className="wl-apdex-targets">
        {names.map((n) => (
          <Field key={n} label={`${n} (ms)`} type="number" min={1} max={60000} disabled={!canWrite} value={draft[n] ?? ""} placeholder={String(DEFAULT_APDEX_MS)} onChange={(e) => setDraft((d) => ({ ...d, [n]: e.target.value }))} />
        ))}
      </div>
      {names.length === 0 && <p className="wl-muted">No services yet.</p>}
      {note && <p className="wl-small">{note}</p>}
    </Panel>
  );
}
