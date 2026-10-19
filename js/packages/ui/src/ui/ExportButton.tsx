import { useState } from "react";
import { Upload } from "lucide-react";
import type { ModelOf } from "@wizeworks/lens-core";
import { downloadCsv } from "../data/csv";
import { EXPORTS, type ExportPage } from "../data/exports";
import { useHost, useRange } from "../data/host";
import { loadPageModel } from "../data/models";
import { useRoute } from "../routes";

const EXPORT_MAX = 5000;

/** Downloads what the page lists, with its filters, as CSV (up to 5000 rows). Built in the browser. */
export function ExportButton({ page, disabled = false }: { page: ExportPage; disabled?: boolean }) {
  const [range] = useRange();
  const server = useHost().has("serverStats");
  const query = useRoute().query;
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    const params = { ...Object.fromEntries(query), page: "1", size: String(EXPORT_MAX) };
    void loadPageModel(page, params, range, server)
      .then((m) => downloadCsv(page, (EXPORTS[page] as (x: ModelOf<typeof page>) => string)(m)))
      .finally(() => setBusy(false));
  };
  return (
    <button type="button" className="wl-btn wl-btn-sm" onClick={run} disabled={disabled || busy} title={`Download as CSV (up to ${EXPORT_MAX.toLocaleString()} rows)`}>
      <Upload aria-hidden="true" /> Export
    </button>
  );
}
