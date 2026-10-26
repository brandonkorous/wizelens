import { useState } from "react";
import { MAX_BULK } from "@wizeworks/lens-core";
import { apiSend } from "../../data/api";
import { inParts, type PartsRun } from "../../data/bulk";
import { type CsvColumns, downloadCsv, downloadText, toCsv } from "../../data/csv";
import { fmtDate } from "../../format";
import { useAsk } from "../../ui/Dialog";
import { SelectField } from "../../ui/Field";
import { Modal } from "../../ui/Modal";
import { OneTimeSecrets, PartsProgress } from "../../ui/OneTimeSecrets";
import { type Column, Table } from "../../ui/Table";
import { useLeaveGuard } from "../../ui/useLeaveGuard";
import type { ApiKey } from "../organization/orgTypes";

/** One rotated key: the new secret, sent once, and when the old one stops. */
interface Rotated {
  id: string;
  oldId: string;
  token: string;
  name: string;
  kind: ApiKey["kind"];
  projectIds: string[];
  oldExpiresMs: number;
}

const GRACE: [string, string][] = [["0", "At once"], ["1", "In 1 hour"], ["24", "In 24 hours"], ["72", "In 3 days"], ["168", "In 7 days"]];

const columnsOf = (names: Map<string, string>): CsvColumns<Rotated> => [
  ["key_name", (k) => k.name],
  ["kind", (k) => k.kind],
  ["projects", (k) => k.projectIds.map((id) => names.get(id) ?? id).join(" ")],
  ["project_ids", (k) => k.projectIds.join(" ")],
  ["key_id", (k) => k.id],
  ["old_key_id", (k) => k.oldId],
  ["key", (k) => k.token],
  ["old_key_stops", (k) => new Date(k.oldExpiresMs).toISOString()],
];

function RotatedTable({ run, names }: { run: PartsRun<string, Rotated>; names: Map<string, string> }) {
  const columns: Column<Rotated>[] = [
    { key: "name", header: "Key", cell: (k) => <strong>{k.name}</strong> },
    { key: "projects", header: "Projects", cell: (k) => k.projectIds.map((id) => names.get(id) ?? "Deleted project").join(", "), className: "wl-wrap" },
    { key: "new", header: "New secret", cell: (k) => <span className="wl-mono">{k.token.slice(0, 12)}…</span> },
    { key: "stops", header: "Old secret stops", cell: (k) => fmtDate(k.oldExpiresMs), className: "wl-nowrap" },
  ];
  return (
    <>
      {run.error && <div className="wl-banner wl-banner-error">It stopped after {run.done.length} keys: {run.error} The other {run.left.length} keys were not rotated.</div>}
      <Table paging={{ noun: "keys" }} columns={columns} rows={run.done} rowKey={(k) => k.id} />
    </>
  );
}

/** Rotate the picked keys: pick how long the old secrets keep working, then save the new ones, shown once. */
export function RotateKeys({ orgId, keys, names, reload, onClose }: { orgId: string; keys: ApiKey[]; names: Map<string, string>; reload: () => void; onClose: () => void }) {
  const [grace, setGrace] = useState("24");
  const [done, setDone] = useState<number | null>(null);
  const [run, setRun] = useState<PartsRun<string, Rotated> | null>(null);
  const [saved, setSaved] = useState(false);
  const { dialog, confirm } = useAsk();
  const unsaved = !!run && run.done.length > 0 && !saved;
  useLeaveGuard(unsaved || done !== null);
  const start = async () => {
    setDone(0);
    const send = async (ids: string[]) => (await apiSend<{ keys: Rotated[] }>("POST", `./api/orgs/${orgId}/keys/rotate`, { keyIds: ids, graceHours: Number(grace) })).keys;
    const out = await inParts(keys.map((k) => k.id), MAX_BULK, send, setDone);
    setDone(null);
    setRun(out);
    reload();
  };
  const close = async () => {
    if (unsaved && !(await confirm({ title: "Close without saving the keys?", body: "The new secrets are not shown again. You would have to rotate these keys again.", confirmLabel: "Close without saving", danger: true }))) return;
    onClose();
  };
  const csv = () => toCsv(columnsOf(names), run?.done ?? []);
  return (
    <Modal title={`Rotate ${keys.length} ${keys.length === 1 ? "key" : "keys"}`} wide onClose={done === null ? () => void close() : undefined} closeLabel={run ? "Done" : "Close"}>
      <div className="wl-form">
        {done !== null && <PartsProgress done={done} total={keys.length} what="Rotated" />}
        {done === null && !run && (
          <>
            <p className="wl-muted wl-modal-lead">Each key gets a new secret with the same name, projects, scopes, and lifetime. Apps keep working with the old secret until it stops, so you can update them first.</p>
            <SelectField label="Old secrets stop" value={grace} options={GRACE} onChange={setGrace} />
          </>
        )}
        {done === null && run && run.done.length > 0 && <OneTimeSecrets csv={csv()} saveCsv={() => downloadCsv("rotated-keys", csv())} saveJson={() => downloadText("rotated-keys", "json", JSON.stringify(run.done, null, 2), "application/json")} onSaved={() => setSaved(true)} />}
        {done === null && run && <RotatedTable run={run} names={names} />}
        {done === null && (
          <div className="wl-form-actions">
            <button type="button" className="wl-btn" onClick={() => void close()}>{run ? "Done" : "Cancel"}</button>
            {!run && <button type="button" className="wl-btn wl-btn-primary" onClick={() => void start()}>Rotate {keys.length === 1 ? "key" : `${keys.length} keys`}</button>}
          </div>
        )}
      </div>
      {dialog}
    </Modal>
  );
}
