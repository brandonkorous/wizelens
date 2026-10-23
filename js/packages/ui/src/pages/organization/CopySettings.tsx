import { useState } from "react";
import { MAX_BULK } from "@wizeworks/lens-core";
import { apiSend } from "../../data/api";
import { inParts } from "../../data/bulk";
import { Check } from "../../ui/Field";
import { Modal } from "../../ui/Modal";
import { ProjectPicker } from "../../ui/ProjectPicker";

export interface CopySettingsProps {
  orgId: string;
  from: { id: string; name: string };
  /** Projects you may change, by id and name. */
  targets: [string, string][];
  onClose: () => void;
}

/** Copy one project's saved settings to many: thresholds and hidden keys, and if picked, how long traces and logs are kept. */
export function CopySettings({ orgId, from, targets, onClose }: CopySettingsProps) {
  const projects = targets.filter(([id]) => id !== from.id).map(([id, name]) => ({ id, name }));
  const [picked, setPicked] = useState<string[]>([]);
  const [checks, setChecks] = useState(true);
  const [retention, setRetention] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const parts = [...(checks ? ["checks"] : []), ...(retention ? ["retention"] : [])];
  const copy = async () => {
    setBusy(true);
    const send = async (ids: string[]) => (await apiSend("POST", `./api/orgs/${encodeURIComponent(orgId)}/settings/copy`, { from: from.id, projectIds: ids, parts }), ids);
    const run = await inParts(picked, MAX_BULK, send);
    setBusy(false);
    setNote(run.error ? { ok: false, text: run.done.length ? `Copied to ${run.done.length}, then stopped: ${run.error}` : run.error } : { ok: true, text: `Copied to ${run.done.length} ${run.done.length === 1 ? "project" : "projects"}.` });
  };
  return (
    <Modal title={`Copy the settings of ${from.name}`} onClose={onClose} wide>
      <div className="wl-form">
        <p className="wl-muted wl-modal-lead">The saved settings are copied. A setting {from.name} leaves to the organization is left to the organization in each project too.</p>
        <fieldset className="wl-check-list">
          <legend>What to copy</legend>
          <Check label="Thresholds and hidden keys" checked={checks} onChange={(e) => setChecks(e.target.checked)} />
          <Check label="Data retention (traces and logs)" checked={retention} onChange={(e) => setRetention(e.target.checked)} />
        </fieldset>
        <ProjectPicker projects={projects} picked={picked} onChange={setPicked} legend="Copy to" />
        {note && <div className={`wl-banner ${note.ok ? "wl-banner-info" : "wl-banner-error"}`} role="status">{note.text}</div>}
        <div className="wl-form-actions">
          <button type="button" className="wl-btn" onClick={onClose}>{note?.ok ? "Done" : "Cancel"}</button>
          <button type="button" className="wl-btn wl-btn-primary" disabled={busy || picked.length === 0 || parts.length === 0} onClick={() => void copy()}>
            Copy to {picked.length} {picked.length === 1 ? "project" : "projects"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
