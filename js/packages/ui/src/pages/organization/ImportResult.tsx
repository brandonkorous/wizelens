import { Badge, CopyButton } from "../../ui/Badges";
import { OneTimeSecrets } from "../../ui/OneTimeSecrets";
import { type Column, Table } from "../../ui/Table";
import { type ImportedKey, type ImportRun, keysCsv, saveKeysCsv, saveKeysJson, saveLeftRows } from "./importFile";

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
      <Table paging={{ noun: "keys" }} columns={columns} rows={keys} rowKey={(k) => k.keyId} />
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
  return (
    <>
      {run.error && <Stopped run={run} />}
      {run.keys.length > 0 && (
        <>
          <OneTimeSecrets csv={keysCsv(run.keys)} saveCsv={() => saveKeysCsv(run.keys)} saveJson={() => saveKeysJson(run.keys)} onSaved={onSaved} />
          <p>
            Made {count(run.keys.length, "sending key")} and {count(made.size, "new project")}.{old ? ` ${old === 1 ? "1 project was" : `${old} projects were`} already there and got new keys.` : ""}
          </p>
          <KeyTable keys={run.keys} />
        </>
      )}
    </>
  );
}
