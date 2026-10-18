import { useState } from "react";
import { Upload } from "lucide-react";
import { isSortKey, type RequestsModel, type Sort, type SortKey } from "@wizeworks/lens-core";
import { useHost, useRange } from "../../data/host";
import { loadPageModel } from "../../data/models";
import { fmtCount } from "../../format";
import { setQuery, useRoute } from "../../routes";
import { Pager } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { Table } from "../../ui/Table";
import { requestColumns } from "./columns";
import { downloadCsv } from "./exportCsv";

const EXPORT_MAX = 5000;

function useSort(): [Sort, (k: SortKey) => void] {
  const q = useRoute().query;
  const key = q.get("sort") ?? undefined;
  const sort: Sort = { key: isSortKey(key) ? key : "time", desc: q.get("desc") !== "0" };
  const onSort = (k: SortKey) => setQuery({ sort: k, desc: sort.key === k && sort.desc ? "0" : null, page: null });
  return [sort, onSort];
}

function useExport(): [boolean, () => void] {
  const [range] = useRange();
  const server = useHost().has("serverStats");
  const query = useRoute().query;
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    const params = { ...Object.fromEntries(query), page: "1", size: String(EXPORT_MAX) };
    void loadPageModel("requests", params, range, server)
      .then((m) => downloadCsv(m.rows))
      .finally(() => setBusy(false));
  };
  return [busy, run];
}

/** Sorted, paged request list with CSV export. A row click opens the side panel. Sort and page live in the URL. */
export function RequestsTable({ model, selectedId }: { model: RequestsModel; selectedId: string | null }) {
  const [sort, onSort] = useSort();
  const [exporting, exportAll] = useExport();
  const title = (
    <h2>
      Requests ({fmtCount(model.total)}){!selectedId && model.total > 0 && <span className="wl-muted wl-small wl-rq-pick"> · pick one to see its details</span>}
    </h2>
  );
  // With the details open, Fetch and Insights make room; both are in the details too.
  const columns = requestColumns(sort, onSort).filter((c) => !selectedId || (c.key !== "fetch" && c.key !== "insights"));
  const action = (
    <button type="button" className="wl-btn" onClick={exportAll} disabled={model.total === 0 || exporting} title={`Download the filtered requests as CSV (up to ${fmtCount(EXPORT_MAX)})`}>
      <Upload aria-hidden="true" /> Export
    </button>
  );
  const empty = (
    <Empty title={model.filtered ? "No requests match these filters" : "No requests in this range"}>
      {model.filtered ? "Change or reset the filters." : "Use your app and requests show up here."}
    </Empty>
  );
  return (
    <Panel flush title={title} action={action}>
      <Table columns={columns} rows={model.rows} rowKey={(r) => r.traceId} selectedKey={selectedId} onRowClick={(r) => setQuery({ trace: r.traceId })} empty={empty} />
      {model.total > 0 && (
        <Pager page={model.page} pageSize={model.pageSize} total={model.total} noun="requests" onPage={(p) => setQuery({ page: p })} onPageSize={(s) => setQuery({ size: s, page: null })} />
      )}
    </Panel>
  );
}
