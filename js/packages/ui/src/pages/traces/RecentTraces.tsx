import { requestOf, type Trace, type TraceListItem } from "@wizeworks/lens-core";
export { tracePath } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, shortId } from "../../format";
import { hrefTo, setQuery, useRoute } from "../../routes";
import { Dot, toneOfHealth, type Tone } from "../../ui/Badges";
import { Pager, SearchInput } from "../../ui/Controls";
import { useSearchText } from "../../ui/useSearchText";
import { Empty, Panel, ViewAll } from "../../ui/Panel";

export function traceTone(t: Trace): Tone {
  const row = requestOf(t);
  if (row) return toneOfHealth(row.health);
  return t.status === "error" ? "danger" : "success";
}


function TraceRow({ item, selected }: { item: TraceListItem; selected: boolean }) {
  return (
    <tr className={`wl-clickable${selected ? " wl-selected" : ""}`} onClick={() => setQuery({ trace: item.traceId })}>
      <td>
        <a href={hrefTo("traces", [], { trace: item.traceId })} className="wl-mono" onClick={(e) => e.stopPropagation()}>
          {shortId(item.traceId)}
        </a>
      </td>
      <td className="wl-wrap">{item.path}</td>
      <td className="wl-num">{fmtMs(item.durationMs)}</td>
      <td className="wl-num">
        <Dot tone={item.health ? toneOfHealth(item.health) : item.status === "error" ? "danger" : "success"} title={item.status} />
      </td>
    </tr>
  );
}

export interface RecentTracesProps {
  items: readonly TraceListItem[];
  total: number;
  page: number;
  size: number;
  selectedId: string | null;
}

/** One page of the traces that match the filter, with a search box. A click shows the trace on the right. */
export function RecentTraces({ items, total, page, size, selectedId }: RecentTracesProps) {
  const query = useRoute().query.get("q") ?? "";
  const [text, setText] = useSearchText(query);
  return (
    <Panel title={`Traces (${fmtCount(total)})`} action={<ViewAll href={hrefTo("requests", [], { q: query })} label="View requests" />}>
      <SearchInput value={text} onChange={setText} placeholder="Search traces by ID, path, or service…" />
      {items.length === 0 ? (
        <Empty>{query && total === 0 ? "No traces match." : "No traces in this time range yet."}</Empty>
      ) : (
        <div className="wl-table-wrap wl-recent-traces">
          <table className="wl-table">
            <thead>
              <tr>
                <th>Trace ID</th>
                <th>Path</th>
                <th className="wl-num">Duration</th>
                <th className="wl-num">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <TraceRow key={t.traceId} item={t} selected={t.traceId === selectedId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > size && <Pager page={page} pageSize={size} total={total} noun="traces" onPage={(p) => setQuery({ page: p })} onPageSize={(s) => setQuery({ size: s, page: null })} />}
    </Panel>
  );
}
