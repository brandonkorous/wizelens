import { type ReactNode, useMemo, useState } from "react";
import { type CheckImportRow, parseCheckImport, UPTIME_LIMITS } from "@wizeworks/lens-core";
import { eachOne, eachText } from "../../data/bulk";
import { LIST_FILES, textOfFile } from "../../data/fileText";
import type { UptimeApi } from "../../data/uptime";
import { TextArea } from "../../ui/Field";
import { FileDrop } from "../../ui/FileDrop";
import { Modal } from "../../ui/Modal";
import { PartsProgress } from "../../ui/OneTimeSecrets";
import { type Column, Table } from "../../ui/Table";

const PLACEHOLDER = ["https://shop.example.com", "https://api.example.com/health", "name,url,method,interval", "Checkout,https://shop.example.com/checkout,GET,1"].join("\n");

const COLUMNS: Column<CheckImportRow>[] = [
  { key: "row", header: "Row", num: true, cell: (r) => r.row },
  { key: "name", header: "Check", cell: (r) => <strong>{r.input.name}</strong> },
  { key: "url", header: "Calls", cell: (r) => <span className="wl-mono wl-small">{r.input.method} {r.input.url}</span>, className: "wl-wrap" },
  { key: "every", header: "Every", cell: (r) => `${r.input.intervalMin} min` },
  { key: "status", header: "Expects", cell: (r) => r.input.expectStatus },
];

/** Many checks from a file or a pasted list of URLs. Each is added like one made by hand; a failed one does not stop the rest. */
export function ImportChecks({ api, lead, projectId, onClose }: { api: UptimeApi; lead: ReactNode; projectId?: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const room = UPTIME_LIMITS.maxChecks - (api.data?.checks.length ?? 0);
  const parsed = useMemo(() => (text.trim() ? parseCheckImport(text, Math.max(room, 0)) : null), [text, room]);
  const rows = parsed?.problems.length === 0 ? parsed.rows : [];
  const pick = (file: File) => void textOfFile(file).then((t) => (setFileName(file.name), setText(t)), (err: unknown) => setResult({ ok: false, text: String(err instanceof Error ? err.message : err) }));
  const start = async () => {
    setDone(0);
    const run = await eachOne(rows, (r) => api.quiet.create(r.input, projectId), setDone);
    setDone(null);
    api.reload();
    setResult({ ok: !run.failed.length, text: eachText(run, rows.length, "Added", (r) => r.input.name) ?? `Added ${run.done.length} checks.` });
  };
  return (
    <Modal title="Import uptime checks" wide onClose={done === null ? onClose : undefined}>
      <div className="wl-form">
        {done !== null ? <PartsProgress done={done} total={rows.length} what="Added" /> : (
          <>
            {lead}
            <p className="wl-muted wl-modal-lead">One URL per row, or columns <code>url</code>, <code>name</code>, <code>method</code>, <code>interval</code> (minutes), and <code>expected status</code>. This project has room for {room} more checks.</p>
            <FileDrop accept={LIST_FILES} fileName={fileName} hint="Excel (.xlsx), CSV, JSON, or a list of URLs." status={`${parsed?.rows.length ?? 0} checks read.`} onFile={pick} />
            <TextArea label="Or paste the URLs" rows={4} value={text} onChange={(e) => (setFileName(null), setText(e.target.value))} placeholder={PLACEHOLDER} />
            {parsed && parsed.problems.length > 0 && <div className="wl-banner wl-banner-error">{parsed.problems.slice(0, 10).map((p) => <div key={`${p.row}${p.message}`}>{p.row ? `Row ${p.row}: ` : ""}{p.message}</div>)}</div>}
            {rows.length > 0 && <Table paging={{ noun: "checks" }} columns={COLUMNS} rows={rows} rowKey={(r) => String(r.row)} />}
            {result && <div className={`wl-banner ${result.ok ? "wl-banner-info" : "wl-banner-error"}`} role="status">{result.text}</div>}
            <div className="wl-form-actions">
              <button type="button" className="wl-btn" onClick={onClose}>{result ? "Done" : "Cancel"}</button>
              {!result && <button type="button" className="wl-btn wl-btn-primary" disabled={rows.length === 0} onClick={() => void start()}>Add {rows.length} {rows.length === 1 ? "check" : "checks"}</button>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
