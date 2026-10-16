import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import type { RequestRow } from "@wizeworks/lens-core";
import { fmtCount } from "../../format";
import { setQuery } from "../../routes";
import { Pager } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { Table } from "../../ui/Table";
import { requestColumns, type Sort, type SortKey, sortRows } from "./columns";
import { downloadCsv } from "./exportCsv";

export interface RequestsTableProps {
  rows: readonly RequestRow[];
  selectedId: string | null;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  filtered: boolean;
}

/** Sorted, paged request list with CSV export. A row click opens the side panel. */
export function RequestsTable({ rows, selectedId, page, pageSize, onPage, onPageSize, filtered }: RequestsTableProps) {
  const [sort, setSort] = useState<Sort>({ key: "time", desc: true });
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const columns = useMemo(() => requestColumns(sort, onSort), [sort]);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const title = <h2>Requests ({fmtCount(rows.length)})</h2>;
  const action = (
    <button type="button" className="wl-btn" onClick={() => downloadCsv(sorted)} disabled={rows.length === 0} title="Download the filtered requests as CSV">
      <Upload aria-hidden="true" /> Export
    </button>
  );
  const empty = <Empty title={filtered ? "No requests match these filters" : "No requests in this range"}>{filtered ? "Change or reset the filters." : "Use your app and requests show up here."}</Empty>;
  return (
    <Panel flush title={title} action={action}>
      <Table columns={columns} rows={pageRows} rowKey={(r) => r.traceId} selectedKey={selectedId} onRowClick={(r) => setQuery({ trace: r.traceId })} empty={empty} />
      {rows.length > 0 && <Pager page={page} pageSize={pageSize} total={rows.length} noun="requests" onPage={onPage} onPageSize={onPageSize} />}
    </Panel>
  );
}
