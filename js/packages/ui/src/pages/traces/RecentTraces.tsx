import { useMemo, useState } from "react";
import { requestOf, type Trace, traceDurationOf } from "@wizeworks/lens-core";
import { fmtMs, shortId } from "../../format";
import { hrefTo, setQuery } from "../../routes";
import { Dot, toneOfHealth, type Tone } from "../../ui/Badges";
import { SearchInput } from "../../ui/Controls";
import { Empty, Panel, ViewAll } from "../../ui/Panel";

const LIMIT = 10;

export function traceTone(t: Trace): Tone {
  const row = requestOf(t);
  if (row) return toneOfHealth(row.health);
  return t.status === "error" ? "danger" : "success";
}

export function tracePath(t: Trace): string {
  const url = t.rootUrl ?? t.rootName;
  if (!/^https?:\/\//.test(url)) return url;
  const u = new URL(url);
  return u.pathname + u.search;
}

function matches(t: Trace, q: string): boolean {
  if (!q) return true;
  return t.traceId.startsWith(q) || tracePath(t).toLowerCase().includes(q) || t.services.some((s) => s.toLowerCase().includes(q));
}

function TraceRow({ trace, selected }: { trace: Trace; selected: boolean }) {
  return (
    <tr className={`wl-clickable${selected ? " wl-selected" : ""}`} onClick={() => setQuery({ trace: trace.traceId })}>
      <td>
        <a href={hrefTo("traces", [], { trace: trace.traceId })} className="wl-mono" onClick={(e) => e.stopPropagation()}>
          {shortId(trace.traceId)}
        </a>
      </td>
      <td className="wl-wrap">{tracePath(trace)}</td>
      <td className="wl-num">{fmtMs(traceDurationOf(trace))}</td>
      <td className="wl-num">
        <Dot tone={traceTone(trace)} title={trace.status} />
      </td>
    </tr>
  );
}

/** The newest traces in the range, with a search box. A click shows the trace on the right. */
export function RecentTraces({ traces, selectedId }: { traces: readonly Trace[]; selectedId: string | null }) {
  const [query, setQ] = useState("");
  const shown = useMemo(() => traces.filter((t) => matches(t, query.trim().toLowerCase())).slice(0, LIMIT), [traces, query]);
  return (
    <Panel title="Recent Traces" action={<ViewAll href={hrefTo("requests")} />}>
      <SearchInput value={query} onChange={setQ} placeholder="Search traces by ID, path, or service…" />
      {shown.length === 0 ? (
        <Empty>{traces.length ? "No traces match." : "No traces in this time range yet."}</Empty>
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
              {shown.map((t) => (
                <TraceRow key={t.traceId} trace={t} selected={t.traceId === selectedId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
