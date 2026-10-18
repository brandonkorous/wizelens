import { useCallback, useEffect, useState } from "react";
import { auth } from "../../data/account";
import { fmtDate } from "../../format";
import { Field, FormRow } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { ActionNotes, onForm, useAction } from "./useAction";

interface PasskeyRow {
  id: string;
  name?: string | null;
  createdAt: Date | string;
  deviceType?: string;
}

const msOf = (d: Date | string) => new Date(d).getTime();

/** Passkeys of this account: add one (needs a recent sign-in), rename, or delete. */
export function PasskeysPanel() {
  const a = useAction();
  const [rows, setRows] = useState<PasskeyRow[]>([]);
  const load = useCallback(() => void auth((c) => c.passkey.listUserPasskeys()).then((list) => setRows(list as PasskeyRow[]), () => undefined), []);
  useEffect(load, [load]);
  const add = onForm((v, form) => void a.run(() => auth((c) => c.passkey.addPasskey({ name: v.name || undefined })), "Passkey added.").then((ok) => ok && (form.reset(), load())));
  const rename = (p: PasskeyRow) => {
    const name = window.prompt("New name for this passkey", p.name ?? "")?.trim();
    if (name) void a.run(() => auth((c) => c.passkey.updatePasskey({ id: p.id, name }))).then(load);
  };
  const remove = (p: PasskeyRow) => window.confirm(`Delete the passkey "${p.name || "Passkey"}"?`) && void a.run(() => auth((c) => c.passkey.deletePasskey({ id: p.id }))).then(load);
  const columns: Column<PasskeyRow>[] = [
    { key: "name", header: "Passkey", cell: (p) => <strong>{p.name || "Passkey"}</strong> },
    { key: "kind", header: "Kind", cell: (p) => (p.deviceType === "multiDevice" ? "Synced" : "This device only") },
    { key: "added", header: "Added", cell: (p) => fmtDate(msOf(p.createdAt)) },
    {
      key: "x",
      header: "",
      cell: (p) => (
        <span className="wl-row-actions">
          <button type="button" className="wl-link-btn" onClick={() => rename(p)}>Rename</button>
          <button type="button" className="wl-link-btn wl-text-error" onClick={() => remove(p)}>Delete</button>
        </span>
      ),
    },
  ];
  return (
    <Panel title="Passkeys">
      <form className="wl-form" onSubmit={add}>
        <FormRow>
          <Field label="Name (optional)" name="name" placeholder="Work laptop" />
          <button type="submit" className="wl-btn wl-btn-primary" disabled={a.busy}>Add a passkey</button>
        </FormRow>
        <ActionNotes a={a} />
      </form>
      <Table columns={columns} rows={rows} rowKey={(p) => p.id} empty={<Empty>No passkeys yet. A passkey signs you in with your fingerprint, face, or device PIN.</Empty>} />
    </Panel>
  );
}
