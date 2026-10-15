import type { Span, Trace } from "@wizeworks/lens-core";
import { fmtMs, serviceSlot } from "../format";

function prettyParams(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function SpanPanel({ span, trace, onClose }: { span: Span; trace: Trace; onClose: () => void }) {
  const sql = span.attributes["db.query.text"];
  const params = prettyParams(span.attributes["wizelens.db.parameters"]);
  const attrs = Object.entries(span.attributes).filter(([k]) => k !== "db.query.text" && k !== "wizelens.db.parameters");
  const logs = trace.logs.filter((l) => l.spanId === span.spanId);

  return (
    <aside className="span-panel" aria-label="Span details">
      <div className="sp-head">
        <h2 title={span.name}>{span.name}</h2>
        <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close details">
          ✕
        </button>
      </div>
      <dl className="sp-facts">
        <dt>Service</dt>
        <dd>
          <span className={`chip svc svc-${serviceSlot(span.service, trace.services)}`}>{span.service}</span>
        </dd>
        <dt>Kind</dt>
        <dd>
          {span.kind} · {span.category}
        </dd>
        <dt>Duration</dt>
        <dd>{fmtMs(span.durationMs)}</dd>
        <dt>Starts at</dt>
        <dd>+{fmtMs(span.startMs - trace.startMs)}</dd>
        <dt>Status</dt>
        <dd className={span.status === "error" ? "text-error" : undefined}>
          {span.status}
          {span.statusMessage ? ` · ${span.statusMessage}` : ""}
        </dd>
        <dt>Span id</dt>
        <dd className="mono">{span.spanId}</dd>
      </dl>

      {typeof sql === "string" && (
        <>
          <h3>Query</h3>
          <pre className="code">{sql}</pre>
          {params && (
            <>
              <h3>Parameters</h3>
              <pre className="code">{params}</pre>
            </>
          )}
        </>
      )}

      {span.events.length > 0 && (
        <>
          <h3>Events</h3>
          {span.events.map((e, i) => (
            <div key={i} className={`sp-event ${e.name === "exception" ? "sp-exception" : ""}`}>
              <div className="sp-event-head">
                <strong>{e.name}</strong>
                <span className="muted">+{fmtMs(e.timeMs - trace.startMs)}</span>
              </div>
              {e.name === "exception" ? (
                <>
                  <div>
                    <strong>{String(e.attributes["exception.type"] ?? "Error")}</strong>: {String(e.attributes["exception.message"] ?? "")}
                  </div>
                  {e.attributes["exception.stacktrace"] && <pre className="code stack">{String(e.attributes["exception.stacktrace"])}</pre>}
                </>
              ) : (
                <AttrTable entries={Object.entries(e.attributes)} />
              )}
            </div>
          ))}
        </>
      )}

      {logs.length > 0 && (
        <>
          <h3>Logs</h3>
          <ul className="sp-logs">
            {logs.map((l, i) => (
              <li key={i}>
                <span className={`lvl lvl-${l.level}`}>{l.level}</span> {l.message}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Attributes</h3>
      <AttrTable entries={attrs} />
    </aside>
  );
}

function AttrTable({ entries }: { entries: [string, unknown][] }) {
  if (entries.length === 0) return <div className="muted small">None</div>;
  return (
    <table className="attrs">
      <tbody>
        {entries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td className={v === "[redacted]" ? "redacted" : undefined}>{v === null ? <span className="muted">null</span> : String(v)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
