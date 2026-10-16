import { useEffect, useMemo, useState } from "react";
import { requestOf, type RequestRow, type Trace } from "@wizeworks/lens-core";
import { useWindowed } from "../../data/hooks";
import { useRoute } from "../../routes";
import { Panel, PageHeader } from "../../ui/Panel";
import { applyFilter, filterFromQuery, isFiltered, optionsOf } from "./filters";
import { RequestFilters } from "./RequestFilters";
import { RequestPanel } from "./RequestPanel";
import { RequestsCards } from "./RequestsCards";
import { RequestsTable } from "./RequestsTable";
import "../../styles/pages/requests.css";

const DEFAULT_PAGE_SIZE = 15;

/** The selected request, also when it is outside the time range (for example from search). */
function useSelected(id: string | null, rows: readonly RequestRow[], all: readonly Trace[]): { row: RequestRow | null; trace: Trace | undefined } {
  return useMemo(() => {
    if (!id) return { row: null, trace: undefined };
    const trace = all.find((t) => t.traceId === id);
    const row = rows.find((r) => r.traceId === id) ?? (trace ? requestOf(trace) : null);
    return { row, trace };
  }, [id, rows, all]);
}

function usePaging(resetKey: string): { page: number; pageSize: number; setPage: (p: number) => void; setPageSize: (s: number) => void } {
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(DEFAULT_PAGE_SIZE);
  useEffect(() => setPage(1), [resetKey]);
  return { page, pageSize, setPage, setPageSize: (s) => (setSize(s), setPage(1)) };
}

function NoSelection({ id }: { id: string | null }) {
  return (
    <Panel className="wl-rq-side wl-rq-hint">
      <p className="wl-muted">{id ? "This request is no longer in memory." : "Select a request to see its details, headers, response, and trace."}</p>
    </Panel>
  );
}

export function RequestsPage() {
  const route = useRoute();
  const w = useWindowed();
  const filter = useMemo(() => filterFromQuery(route.query), [route.query]);
  const rows = useMemo(() => applyFilter(w.requests, filter), [w.requests, filter]);
  const prevRows = useMemo(() => applyFilter(w.prevRequests, filter), [w.prevRequests, filter]);
  const options = useMemo(() => optionsOf(w.requests), [w.requests]);
  const paging = usePaging(JSON.stringify(filter) + w.range);
  const selectedId = route.query.get("trace");
  const selected = useSelected(selectedId, w.requests, w.all);
  return (
    <>
      <PageHeader title="Requests" subtitle="Inspect and analyze recent request activity across your stack." />
      <RequestFilters filter={filter} methods={options.methods} services={options.services} />
      <RequestsCards rows={rows} prevRows={prevRows} window={w.window} compareLabel={w.compareLabel} />
      <div className="wl-grid wl-grid-side">
        <RequestsTable rows={rows} selectedId={selectedId} page={paging.page} pageSize={paging.pageSize} onPage={paging.setPage} onPageSize={paging.setPageSize} filtered={isFiltered(filter)} />
        {selected.row ? <RequestPanel key={selected.row.traceId} r={selected.row} trace={selected.trace} /> : <NoSelection id={selectedId} />}
      </div>
    </>
  );
}
