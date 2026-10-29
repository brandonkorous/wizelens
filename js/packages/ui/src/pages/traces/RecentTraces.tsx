import { Fragment } from "react";
import { requestOf, type TagRule, type Trace, type TraceListItem } from "@wizeworks/lens-core";
export { tracePath } from "@wizeworks/lens-core";
import { fmtCount, fmtDateTime, fmtMs, fmtTime, shortId, shortPath } from "../../format";
import { hrefTo, setQuery, useRoute } from "../../routes";
import { Dot, toneOfHealth, type Tone } from "../../ui/Badges";
import { Pager } from "../../ui/Controls";
import { urlPaging } from "../../ui/paging";
import { ListQueryBar } from "../../ui/ListQueryBar";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { ExportButton } from "../../ui/ExportButton";
import { TagChips } from "../../ui/TagChips";
import { traceRow, useRowTags } from "../../data/tagMatch";

export function traceTone(t: Trace): Tone {
  const row = requestOf(t);
  if (row) return toneOfHealth(row.health);
  return t.status === "error" ? "danger" : "success";
}


/** A path that wraps after its slashes; a word breaks only when it is wider than the column. */
const atSlashes = (path: string) => path.split("/").map((part, i) => (i === 0 ? part : <Fragment key={i}>/<wbr />{part}</Fragment>));

function TraceRow({ item, selected, tags }: { item: TraceListItem; selected: boolean; tags: readonly TagRule[] }) {
  return (
    <tr className={`wl-clickable${selected ? " wl-selected" : ""}`} onClick={() => setQuery({ trace: item.traceId })}>
      <td>
        <div className="wl-trace-cell">
          <span className="wl-tagged">
            <span title={item.path}>{atSlashes(shortPath(item.path))}</span>
            <TagChips tags={tags} />
          </span>
          <a href={hrefTo("traces", [], { trace: item.traceId })} className="wl-mono wl-small" onClick={(e) => e.stopPropagation()}>
            {shortId(item.traceId)}
          </a>
        </div>
      </td>
      <td data-label="Time" className="wl-nowrap wl-muted" title={fmtDateTime(item.startMs)}>{fmtTime(item.startMs)}</td>
      <td data-label="Duration" className="wl-num">{fmtMs(item.durationMs)}</td>
      <td data-label="Status" className="wl-num">
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
  const tagsOf = useRowTags("traces", items, traceRow);
  return (
    <Panel title={`Traces (${fmtCount(total)})`} action={<span className="wl-row-actions"><ExportButton page="traces" disabled={total === 0} /><ViewAll href={hrefTo("requests", [], { q: query })} label="View requests" /></span>}>
      <ListQueryBar value={query} reset={{ trace: null }} placeholder="ID, path, or service; or service:api duration:>2s" />
      {items.length === 0 ? (
        <Empty>{query && total === 0 ? "No traces match." : "No traces in this time range yet."}</Empty>
      ) : (
        <div className="wl-table-wrap wl-recent-traces">
          <table className="wl-table wl-table-cards">
            <thead>
              <tr>
                <th>Path · trace ID</th>
                <th>Time</th>
                <th className="wl-num">Duration</th>
                <th className="wl-num">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <TraceRow key={t.traceId} item={t} selected={t.traceId === selectedId} tags={tagsOf(t)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={size} total={total} noun="traces" {...urlPaging()} />
    </Panel>
  );
}
