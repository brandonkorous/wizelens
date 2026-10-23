import { useState } from "react";
import { type ProjectImport, type ProjectImportRow } from "@wizeworks/lens-core";
import { Badge } from "../../ui/Badges";
import { FileDrop } from "../../ui/FileDrop";
import { FormRow, SelectField, TextArea } from "../../ui/Field";
import { type Column, Table } from "../../ui/Table";
import { rowsToCsv } from "../../data/csv";
import { readXlsx } from "../../data/xlsx";
import { saveSample } from "./importFile";

const SHOWN = 100;
const ACCEPT = ".csv,.tsv,.txt,.json,.xlsx,text/csv,text/plain,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PLACEHOLDER = ["orders-api", "billing-api", "Shop web,browser,https://shop.example.com"].join("\n");
const EXPIRY: [string, string][] = [["", "Never"], ["30", "In 30 days"], ["90", "In 90 days"], ["180", "In 180 days"], ["365", "In 1 year"]];

/** The rows of a file, as read: what will be made for each. */
function Preview({ rows, existing }: { rows: ProjectImportRow[]; existing: Set<string> }) {
  const columns: Column<ProjectImportRow>[] = [
    { key: "row", header: "Row", num: true, cell: (r) => r.row },
    { key: "name", header: "Project", cell: (r) => <strong>{r.name}</strong> },
    { key: "new", header: "What happens", cell: (r) => (existing.has(r.name.toLowerCase()) ? <Badge tone="neutral">Already there: new key only</Badge> : <Badge tone="success">New project</Badge>) },
    { key: "kind", header: "Key", cell: (r) => (r.kind === "browser" ? "Browser" : "Ingest") },
    { key: "keyName", header: "Key name", cell: (r) => r.keyName },
    { key: "sites", header: "Sites", cell: (r) => r.sites.join(", "), className: "wl-wrap" },
  ];
  return (
    <>
      <Table columns={columns} rows={rows.slice(0, SHOWN)} rowKey={(r) => String(r.row)} />
      {rows.length > SHOWN && <p className="wl-muted wl-small">And {rows.length - SHOWN} more rows.</p>}
    </>
  );
}

/** What is wrong with the file; nothing is made until it is fixed. */
function Problems({ list }: { list: ProjectImport["problems"] }) {
  return (
    <div className="wl-banner wl-banner-error">
      <strong>Fix {list.length === 1 ? "this" : `these ${list.length}`} first. Nothing is made while a row is wrong.</strong>
      <ul className="wl-import-problems">
        {list.slice(0, 20).map((p, i) => <li key={i}>{p.row ? `Row ${p.row}: ` : ""}{p.message}</li>)}
        {list.length > 20 && <li>And {list.length - 20} more.</li>}
      </ul>
    </div>
  );
}

export interface PickProps {
  text: string;
  parsed: ProjectImport | null;
  existing: Set<string>;
  expires: string;
  onText: (text: string) => void;
  onExpires: (v: string) => void;
}

/** A file's text; an Excel sheet becomes CSV, so it shows in the box like any other. */
async function textOfFile(file: File): Promise<string> {
  if (!/\.xlsx$/i.test(file.name)) return file.text();
  return rowsToCsv(await readXlsx(await file.arrayBuffer()));
}

/** Step one: a file or pasted rows, the shared expiry, and a preview of what will be made. */
export function ImportPick({ text, parsed, existing, expires, onText, onExpires }: PickProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = (file: File) =>
    void textOfFile(file).then(
      (t) => (setFileName(file.name), setError(null), onText(t)),
      (err: unknown) => (setFileName(null), setError(err instanceof Error ? err.message : String(err))),
    );
  const typed = (t: string) => (setFileName(null), onText(t));
  const rows = parsed?.rows.length ?? 0;
  const status = parsed?.problems.length ? "It has rows to fix. See below." : `${rows} ${rows === 1 ? "project" : "projects"} read.`;
  return (
    <>
      <p className="wl-muted wl-import-intro">
        One project per row. Columns: <code>name</code>, and if you like <code>kind</code> (ingest or browser), <code>sites</code> (for browser keys), and <code>key name</code>. An Excel sheet (the first one is read), CSV, JSON, or a plain list of names works.{" "}
        <button type="button" className="wl-link-btn" onClick={saveSample}>Download a sample file</button>
      </p>
      <FileDrop accept={ACCEPT} fileName={fileName} hint="Excel (.xlsx), CSV, or JSON, up to 5000 projects. It is read in this browser." status={status} onFile={pick} />
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      <FormRow>
        <TextArea label="Or paste the rows" rows={4} value={text} onChange={(e) => typed(e.target.value)} placeholder={PLACEHOLDER} />
        <SelectField label="Keys expire" value={expires} options={EXPIRY} onChange={onExpires} hint="Every key in the list gets this." />
      </FormRow>
      {parsed && parsed.problems.length > 0 && <Problems list={parsed.problems} />}
      {parsed && parsed.rows.length > 0 && <Preview rows={parsed.rows} existing={existing} />}
    </>
  );
}
