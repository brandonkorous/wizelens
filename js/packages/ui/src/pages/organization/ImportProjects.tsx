import { useMemo, useState } from "react";
import { parseProjectImport } from "@wizeworks/lens-core";
import { loadAccount } from "../../data/account";
import { useAsk } from "../../ui/Dialog";
import { Modal } from "../../ui/Modal";
import { PartsProgress } from "../../ui/OneTimeSecrets";
import { useLeaveGuard } from "../../ui/useLeaveGuard";
import { type ImportRun, runImport } from "./importFile";
import { ImportPick } from "./ImportPick";
import { ImportResult } from "./ImportResult";
import type { OrgData } from "./orgTypes";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Many projects at once, from a file: each row gets a project (unless one has that name) and a new sending key, shown once. */
export function ImportProjectsForm({ orgId, data, reload, onClose }: { orgId: string; data: OrgData; reload: () => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [expires, setExpires] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const [run, setRun] = useState<ImportRun | null>(null);
  const [saved, setSaved] = useState(false);
  const { dialog, confirm } = useAsk();
  const parsed = useMemo(() => (text.trim() ? parseProjectImport(text) : null), [text]);
  const existing = useMemo(() => new Set(data.projects.map((p) => p.name.toLowerCase())), [data.projects]);
  const rows = parsed?.problems.length === 0 ? parsed.rows : [];
  const fresh = rows.filter((r) => !existing.has(r.name.toLowerCase())).length;
  const unsaved = !!run && run.keys.length > 0 && !saved;
  useLeaveGuard(unsaved || done !== null);
  const start = async () => {
    setDone(0);
    const out = await runImport(orgId, rows, expires ? Number(expires) : null, setDone);
    setDone(null);
    setRun(out);
    reload();
    void loadAccount();
  };
  const tryClose = async () => {
    const body = "The new keys are not shown again. Apps cannot send without them, so you would have to rotate each one.";
    if (unsaved && !(await confirm({ title: "Close without saving the keys?", body, confirmLabel: "Close without saving", danger: true }))) return;
    onClose();
  };
  const close = () => void tryClose();
  const makeLabel = rows.length ? `Make ${plural(rows.length, "sending key")} and ${plural(fresh, "new project")}` : "Make projects and keys";
  return (
    <Modal title="Import projects and keys" wide onClose={done === null ? close : undefined} closeLabel={run ? "Done" : "Close"}>
      <div className="wl-form">
        {done !== null && <PartsProgress done={done} total={rows.length} what="Made keys for" />}
        {done === null && run && <ImportResult run={run} onSaved={() => setSaved(true)} />}
        {done === null && !run && <ImportPick text={text} parsed={parsed} existing={existing} expires={expires} onText={setText} onExpires={setExpires} />}
        {done === null && (
          <div className="wl-form-actions">
            <button type="button" className="wl-btn" onClick={close}>{run ? "Done" : "Cancel"}</button>
            {!run && <button type="button" className="wl-btn wl-btn-primary" disabled={rows.length === 0} onClick={() => void start()}>{makeLabel}</button>}
          </div>
        )}
      </div>
      {dialog}
    </Modal>
  );
}
