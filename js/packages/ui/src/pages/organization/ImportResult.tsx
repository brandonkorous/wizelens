import { Badge, CopyButton } from "../../ui/Badges";
import { type Column, Table } from "../../ui/Table";
import { type ImportedKey, type ImportRun, keysCsv, saveKeysCsv, saveKeysJson, saveLeftRows } from "./importFile";

const SHOWN = 100;
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function KeyTable({ keys }: { keys: ImportedKey[] }) {
  const columns: Column<ImportedKey>[] = [
    { key: "project", header: "Project", cell: (k) => <strong>{k.projectName}</strong> },
    { key: "new", header: "", cell: (k) => (k.newProject ? <Badge tone="success">New</Badge> : <Badge tone="neutral">Existing</Badge>) },
    { key: "kind", header: "Key", cell: (k) => `${k.keyName} (${k.kind === "browser" ? "browser" : "ingest"})` },
    { key: "token", header: "Secret", cell: (k) => <span className="wl-id"><span className="wl-mono">{k.prefix}…</span> <CopyButton text={k.token} label={`Copy the key for ${k.projectName}`} /></span> },
  ];
  return (
    <>
      <Table columns={columns} rows={keys.slice(0, SHOWN)} rowKey={(k) => k.keyId} />
      {keys.length > SHOWN && <p className="wl-muted wl-small">And {keys.length - SHOWN} more in the file.</p>}
    </>
  );
}

/** A part failed: the keys before it are made, the rows from it on are not. */
function Stopped({ run }: { run: ImportRun }) {
  return (
    <div className="wl-banner wl-banner-error">
      <strong>It stopped after {run.keys.length} keys.</strong> {run.error} The {run.left.length} rows from there on were not made.{" "}
      <button type="button" className="wl-link-btn" onClick={() => saveLeftRows(run.left)}>Download the rows not made</button> and import that file once the problem is fixed.
    </div>
  );
}

/** Step three: every new secret, shown this once, to save as a file or copy. */
export function ImportResult({ run, onSaved }: { run: ImportRun; onSaved: () => void }) {
  const made = new Set(run.keys.filter((k) => k.newProject).map((k) => k.projectId));
  const old = new Set(run.keys.filter((k) => !made.has(k.projectId)).map((k) => k.projectId)).size;
  const save = (fn: (keys: ImportedKey[]) => void) => () => (fn(run.keys), onSaved());
  return (
    <>
      {run.error && <Stopped run={run} />}
      {run.keys.length > 0 && (
        <>
          <div className="wl-banner wl-banner-warning">
            <strong>Save these keys now. They are shown only this once.</strong> WizeLens keeps only a hash of each key, so no one can show them again. If a key is lost, rotate it.
          </div>
          <p>
            Made {count(run.keys.length, "sending key")} and {count(made.size, "new project")}.{old ? ` ${old === 1 ? "1 project was" : `${old} projects were`} already there and got new keys.` : ""}
          </p>
          <div className="wl-row-actions wl-import-save">
            <button type="button" className="wl-btn wl-btn-primary" onClick={save(saveKeysCsv)}>Download keys (CSV)</button>
            <button type="button" className="wl-btn" onClick={save(saveKeysJson)}>Download keys (JSON)</button>
            <span onClickCapture={onSaved}><CopyButton text={keysCsv(run.keys)} label="Copy all as CSV" asLink /></span>
          </div>
          <KeyTable keys={run.keys} />
        </>
      )}
    </>
  );
}
