import type { ReactNode } from "react";
import { fmtMs, pct, type RecordedRequest, type RequestView } from "@wizeworks/lens-browser";
import { DashLink } from "./panel-parts.js";

type Parts = NonNullable<NonNullable<RecordedRequest["server"]>["parts"]>;

function TipHead({ title, ms, total }: { title: string; ms: number | null; total: number | null }) {
  const share = ms !== total ? pct(ms, total) : "";
  return (
    <>
      <h4>{title}</h4>
      <div className="wl-tip-big">
        {fmtMs(ms)}
        {share && <span className="wl-tip-sub"> ({share})</span>}
      </div>
    </>
  );
}

/** Opens the dashboard in a new tab. Hidden when the server has no trace for the request. */
function TipLink({ children, href }: { children: ReactNode; href: string | null }) {
  return href ? (
    <DashLink className="wl-link" href={href}>
      {children}
    </DashLink>
  ) : null;
}

/** One legend row: a color key, a label, and a time. */
function Row({ cls, label, ms }: { cls?: string; label: ReactNode; ms: number | null }) {
  return (
    <>
      <dt>
        {cls && <i className={`wl-key ${cls}`} />}
        {label}
      </dt>
      <dd>{fmtMs(ms)}</dd>
    </>
  );
}

export function TotalTip({ view, href }: { view: RequestView; href: string | null }) {
  const s = view.segments;
  return (
    <>
      <TipHead title="Total" ms={view.totalMs} total={view.totalMs} />
      <div className="wl-tip-sub">Request start to the next paint</div>
      {s && (
        <dl>
          <Row cls="wl-c-server" label="Server code" ms={s.server} />
          <Row cls="wl-c-db" label="Database" ms={s.db} />
          <Row cls="wl-c-render" label="Render" ms={s.render} />
          <Row cls="wl-c-other" label="Network and other" ms={s.other} />
        </dl>
      )}
      <TipLink href={href}>View the timeline</TipLink>
    </>
  );
}

function ServerParts({ p, total, others }: { p: Parts; total: number; others: string[] }) {
  const w = (ms: number) => ({ width: `${(ms / total) * 100}%` });
  return (
    <>
      <div className="wl-bar" aria-hidden="true">
        <i className="wl-c-server" style={w(p.codeMs)} />
        <i className="wl-c-db" style={w(p.dbMs)} />
        <i className="wl-c-other" style={w(p.httpOutMs)} />
      </div>
      <dl>
        <Row cls="wl-c-server" label="Own code" ms={p.codeMs} />
        <Row cls="wl-c-db" label="Own queries" ms={p.dbMs} />
        <Row cls="wl-c-other" label={`HTTP out (${p.httpOutCount})`} ms={p.httpOutMs} />
      </dl>
      {others.length > 0 && <p>Also called: {others.join(", ")}</p>}
    </>
  );
}

export function ServerTip({ req, view, href }: { req: RecordedRequest; view: RequestView; href: string | null }) {
  const srv = req.server;
  return (
    <>
      <TipHead title="Server" ms={view.serverMs} total={view.totalMs} />
      {!srv && <p>{req.profiled ? "Loading server data…" : "No server data for this request."}</p>}
      {srv?.parts && <ServerParts p={srv.parts} total={view.serverMs || 1} others={srv.services.slice(1)} />}
      <TipLink href={href}>View the server calls</TipLink>
    </>
  );
}

function Spark({ durations }: { durations: number[] }) {
  const max = Math.max(1, ...durations);
  return (
    <div className="wl-spark" aria-hidden="true">
      {durations.map((ms, i) => (
        // Square root keeps one slow query from flattening the others.
        <i key={i} style={{ height: `${Math.max(6, Math.sqrt(ms / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function DbTip({ req, view, href }: { req: RecordedRequest; view: RequestView; href: string | null }) {
  const srv = req.server;
  const bars = srv?.dbDurations.slice(0, 40) ?? [];
  return (
    <>
      <TipHead title="Database" ms={view.dbMs} total={view.totalMs} />
      <div className="wl-tip-sub">{srv ? (srv.dbCount === 1 ? "1 query" : `${srv.dbCount} queries`) : "No data yet"}</div>
      {bars.length > 0 && <Spark durations={bars} />}
      {srv && srv.dbCount > 0 && (
        <dl>
          <Row label="Slowest query" ms={srv.dbSlowestMs} />
          <Row label="Avg. query" ms={srv.dbTotalMs === null ? null : srv.dbTotalMs / srv.dbCount} />
          {srv.dbTotalMs !== null && srv.dbMs !== null && srv.dbTotalMs - srv.dbMs >= 1 && <Row label="All queries added up" ms={srv.dbTotalMs} />}
        </dl>
      )}
      <TipLink href={href}>View all queries</TipLink>
    </>
  );
}

export function RenderTip({ view, href }: { view: RequestView; href: string | null }) {
  return (
    <>
      <TipHead title="Render" ms={view.renderMs} total={view.totalMs} />
      <p>
        {view.renderMs === null
          ? "Not measured. The app did not read the response body, or the tab was hidden."
          : "From the response to the next paint: read the body, run your code, render, paint."}
      </p>
      <TipLink href={href}>View the timeline</TipLink>
    </>
  );
}
