import { useState } from "react";
import { MAX_BULK } from "@wizeworks/lens-core/internal";
import { apiSend } from "../../data/api";
import { inParts } from "../../data/bulk";
import { useAsk } from "../../ui/Dialog";
import { SelectionBar } from "../../ui/Selection";
import type { ApiKey } from "../organization/orgTypes";
import { RotateKeys } from "./RotateKeys";

/** Past this many, revoking asks you to type the word, so a stray click cannot cut off many apps. */
const TYPE_PAST = 5;

export interface KeysBulkProps {
  orgId: string;
  picked: ApiKey[];
  names: Map<string, string>;
  clear: () => void;
  reload: () => void;
  onDone: (error: string | null, note: string | null) => void;
}

/** Rotate or revoke the picked keys together. */
export function KeysBulk({ orgId, picked, names, clear, reload, onDone }: KeysBulkProps) {
  const [rotating, setRotating] = useState<ApiKey[] | null>(null);
  const { dialog, confirm } = useAsk();
  const n = picked.length;
  const revoke = async () => {
    const body = `Apps, pages, and agents that use ${n === 1 ? "this key" : `these ${n} keys`} lose access at once. This cannot be undone.`;
    if (!(await confirm({ title: `Revoke ${n === 1 ? "1 key" : `${n} keys`}?`, body, confirmLabel: "Revoke", danger: true, typeToConfirm: n > TYPE_PAST ? "revoke" : undefined }))) return;
    const send = async (ids: string[]) => (await apiSend<{ revoked: string[] }>("POST", `./api/orgs/${orgId}/keys/revoke`, { keyIds: ids })).revoked;
    const run = await inParts(picked.map((k) => k.id), MAX_BULK, send);
    clear();
    reload();
    onDone(run.error && `Revoked ${run.done.length} keys, then stopped: ${run.error}`, run.error ? null : `Revoked ${run.done.length} ${run.done.length === 1 ? "key" : "keys"}.`);
  };
  return (
    <>
      <SelectionBar count={n} noun="key" onClear={clear}>
        <button type="button" className="wl-btn" onClick={() => setRotating(picked)}>Rotate</button>
        <button type="button" className="wl-btn wl-btn-danger" onClick={() => void revoke()}>Revoke</button>
      </SelectionBar>
      {rotating && <RotateKeys orgId={orgId} keys={rotating} names={names} reload={reload} onClose={() => (setRotating(null), clear())} />}
      {dialog}
    </>
  );
}
