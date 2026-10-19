import { requestOf, type Trace, type TraceListItem } from "@wizeworks/lens-core";
export { tracePath } from "@wizeworks/lens-core";
import { fmtMs, fmtShownOf, shortId } from "../../format";
import { hrefTo, setQuery, useRoute } from "../../routes";
import { Dot, toneOfHealth, type Tone } from "../../ui/Badges";
import { SearchInput } from "../../ui/Controls";
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

/** The newest traces in the range, with a search box. A click shows the trace on the right. */
export function RecentTraces({ items, total, selectedId }: { items: readonly TraceListItem[]; total: number; selectedId: string | null }) {
  const query = useRoute().query.get("q") ?? "";
  return (
    <Panel title={`Recent Traces (${fmtShownOf(items.length, total)})`} action={<ViewAll href={hrefTo("requests", [], { q: query })} />}>
      <SearchInput value={query} onChange={(v) => setQuery({ q: v })} placeholder="Search traces by ID, path, or service…" />
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
    </Panel>
  );
}
