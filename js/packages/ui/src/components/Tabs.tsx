import { useMemo } from "react";
import { errorInfo, type Finding, isErrorSpan, queryText, type Span, type Trace } from "@wizeworks/lens-core";
import { fmtMs, serviceSlot } from "../format";

interface TabProps {
  trace: Trace;
  findings: Finding[];
  selected: string | null;
  highlight: ReadonlySet<string>;
  onSelect: (spanId: string) => void;
}

function badgesFor(findings: Finding[]): Map<string, Set<Finding["kind"]>> {
  const map = new Map<string, Set<Finding["kind"]>>();
  for (const f of findings) {
    for (const id of f.spanIds) {
      const set = map.get(id) ?? new Set();
      set.add(f.kind);
      map.set(id, set);
    }
  }
  return map;
}

const BADGE: Partial<Record<Finding["kind"], string>> = {
  "duplicate-query": "DUP",
  "n+1-db": "N+1",
  "n+1-http": "N+1",
  "slow-query": "SLOW",
};

function Badges({ kinds }: { kinds: Set<Finding["kind"]> | undefined }) {
  if (!kinds) return null;
  return (
    <>
      {[...kinds]
        .filter((k) => BADGE[k])
        .map((k) => (
          <span key={k} className={`badge badge-${k.replace("+", "p")}`}>
            {BADGE[k]}
          </span>
        ))}
    </>
  );
}

const rowClass = (span: Span, p: Pick<TabProps, "selected" | "highlight">) =>
  [p.selected === span.spanId ? "selected" : "", p.highlight.has(span.spanId) ? "highlight" : "", isErrorSpan(span) ? "row-error" : ""].join(" ");

export function SqlTab(props: TabProps) {
  const { trace, findings, onSelect } = props;
  const spans = trace.spans.filter((s) => s.category === "db");
  const badges = useMemo(() => badgesFor(findings), [findings]);
  const unique = new Set(spans.map(queryText)).size;
  const total = spans.reduce((t, s) => t + s.durationMs, 0);

  if (spans.length === 0) return <div className="empty">No database calls in this request.</div>;
  return (
    <>
      <div className="tab-summary">
        <span>
          <strong>{spans.length}</strong> queries
        </span>
        <span>
          <strong>{unique}</strong> unique
        </span>
        <span>
          <strong>{fmtMs(total)}</strong> total
        </span>
      </div>
      <ol className="sql-list">
        {spans.map((s, i) => (
          <li key={s.spanId} className={`sql-item ${rowClass(s, props)}`} onClick={() => onSelect(s.spanId)}>
            <div className="sql-meta">
              <span className="muted">#{i + 1}</span>
              <span className={`chip svc svc-${serviceSlot(s.service, trace.services)}`}>{s.service}</span>
              <span className="muted">{String(s.attributes["db.system.name"] ?? "")}</span>
              {s.attributes["wizelens.db.adapter"] != null && <span className="muted">via {String(s.attributes["wizelens.db.adapter"])}</span>}
              <Badges kinds={badges.get(s.spanId)} />
              <span className="spacer" />
              {s.attributes["db.response.returned_rows"] != null && (
                <span className="muted">{String(s.attributes["db.response.returned_rows"])} rows</span>
              )}
              <strong>{fmtMs(s.durationMs)}</strong>
            </div>
            <pre className="code sql">{queryText(s)}</pre>
            {s.attributes["wizelens.db.parameters"] != null && (
              <div className="sql-params mono small">params: {String(s.attributes["wizelens.db.parameters"])}</div>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

export function HttpTab(props: TabProps) {
  const { trace, findings, onSelect } = props;
  const spans = trace.spans.filter((s) => s.category === "http.client" || s.category === "http.server" || s.category === "browser");
  const badges = useMemo(() => badgesFor(findings), [findings]);
  if (spans.length === 0) return <div className="empty">No HTTP activity in this request.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Direction</th>
            <th>Method</th>
            <th>URL / route</th>
            <th>Service</th>
            <th className="num">Status</th>
            <th className="num">Duration</th>
          </tr>
        </thead>
        <tbody>
          {spans.map((s) => {
            const a = s.attributes;
            const status = a["http.response.status_code"];
            const target = String(a["url.full"] ?? a["http.route"] ?? a["url.path"] ?? s.name);
            return (
              <tr key={s.spanId} className={rowClass(s, props)} onClick={() => onSelect(s.spanId)}>
                <td>
                  <span className={`cat cat-${s.category.replace(".", "-")}`}>
                    {s.category === "http.server" ? "IN" : s.category === "browser" ? "WEB" : "OUT"}
                  </span>
                </td>
                <td className="mono">{String(a["http.request.method"] ?? "")}</td>
                <td className="mono wrap">
                  {target} <Badges kinds={badges.get(s.spanId)} />
                </td>
                <td>
                  <span className={`chip svc svc-${serviceSlot(s.service, trace.services)}`}>{s.service}</span>
                </td>
                <td className={`num ${typeof status === "number" && status >= 400 ? "text-error" : ""}`}>{status ?? "–"}</td>
                <td className="num">{fmtMs(s.durationMs)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LogsTab({ trace, onSelect }: { trace: Trace; onSelect: (spanId: string) => void }) {
  if (trace.logs.length === 0) return <div className="empty">No logs were written during this request.</div>;
  return (
    <div className="table-wrap">
      <table className="table logs">
        <thead>
          <tr>
            <th className="num">At</th>
            <th>Level</th>
            <th>Service</th>
            <th>Category</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {trace.logs.map((l, i) => (
            <tr key={i} onClick={() => l.spanId && onSelect(l.spanId)} className={l.spanId ? undefined : "no-click"}>
              <td className="num muted">+{fmtMs(l.timeMs - trace.startMs)}</td>
              <td>
                <span className={`lvl lvl-${l.level}`}>{l.level}</span>
              </td>
              <td>
                <span className={`chip svc svc-${serviceSlot(l.service, trace.services)}`}>{l.service}</span>
              </td>
              <td className="muted small">{l.category}</td>
              <td className="wrap">{l.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ErrorsTab({ trace, onSelect }: { trace: Trace; onSelect: (spanId: string) => void }) {
  const errors = trace.spans.filter(isErrorSpan).map(errorInfo);
  if (errors.length === 0) return <div className="empty">No errors. 🎉</div>;
  return (
    <ul className="error-list">
      {errors.map((e) => (
        <li key={e.spanId} className="error-item" onClick={() => onSelect(e.spanId)}>
          <div className="error-head">
            <span className={`chip svc svc-${serviceSlot(e.service, trace.services)}`}>{e.service}</span>
            <strong>{e.type ?? "Error"}</strong>
            <span className="muted">in {e.name}</span>
          </div>
          <div className="error-msg">{e.message}</div>
          {e.stack && <pre className="code stack">{e.stack}</pre>}
        </li>
      ))}
    </ul>
  );
}
