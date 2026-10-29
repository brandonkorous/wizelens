import { X } from "lucide-react";
import { endpointNameOf, errorEvents, normalizeQuery, queryText, quoteText, type Span, spanServiceName, type SpanEvent, type Trace } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { endpointHref, errorHref, hrefTo, queryHref } from "../../routes";
import { serviceHref } from "../services/serviceParts";
import { SpanK8s } from "../infra/SpanK8s";
import { ServiceChip } from "./tabParts";
import { StackBox } from "../../ui/StackBox";

function prettyParams(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** A link that searches spans with this attribute value. */
const searchHref = (key: string, value: unknown) => hrefTo("search", [], { q: `@${key}:${quoteText(String(value))}`, kind: "spans" });

function AttrTable({ entries, search = false }: { entries: [string, unknown][]; search?: boolean }) {
  if (entries.length === 0) return <div className="wl-muted wl-small">None</div>;
  return (
    <table className="wl-attrs">
      <tbody>
        {[...entries]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td className={v === "[redacted]" ? "wl-redacted" : undefined}>
                {v === null ? <span className="wl-muted">null</span> : search && v !== "[redacted]" ? <a href={searchHref(k, v)} title="Find spans with this value">{String(v)}</a> : String(v)}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function EventCard({ event, trace }: { event: SpanEvent; trace: Trace }) {
  const a = event.attributes;
  const isException = event.name === "exception";
  return (
    <div className={`wl-sp-event${isException ? " wl-sp-exception" : ""}`}>
      <div className="wl-sp-event-head">
        <strong>{event.name}</strong>
        <span className="wl-muted">+{fmtMs(event.timeMs - trace.startMs)}</span>
      </div>
      {isException ? (
        <>
          <div>
            <strong>{String(a["exception.type"] ?? "Error")}</strong>: {String(a["exception.message"] ?? "")}
          </div>
          {a["exception.stacktrace"] && <StackBox text={String(a["exception.stacktrace"])} />}
        </>
      ) : (
        <AttrTable entries={Object.entries(a)} />
      )}
    </div>
  );
}

function Facts({ span, trace }: { span: Span; trace: Trace }) {
  return (
    <dl className="wl-sp-facts">
      <dt>Service</dt>
      <dd>
        <ServiceChip service={span.service} trace={trace} />
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
      <dd className={span.status === "error" ? "wl-text-error" : undefined}>
        {span.status}
        {span.statusMessage ? ` · ${span.statusMessage}` : ""}
      </dd>
      <dt>Span id</dt>
      <dd className="wl-mono">{span.spanId}</dd>
    </dl>
  );
}

function Query({ span }: { span: Span }) {
  const sql = span.attributes["db.query.text"];
  if (typeof sql !== "string") return null;
  const params = prettyParams(span.attributes["wizelens.db.parameters"]);
  return (
    <>
      <h3>Query</h3>
      <pre className="wl-code">{sql}</pre>
      {params && (
        <>
          <h3>Parameters</h3>
          <pre className="wl-code">{params}</pre>
        </>
      )}
    </>
  );
}

/** Pages about this span: its service, endpoint, query, error group, and the request's logs. */
function SpanLinks({ span, trace }: { span: Span; trace: Trace }) {
  const service = spanServiceName(span);
  const error = errorEvents([trace]).find((e) => e.spanId === span.spanId);
  const links: [string, string][] = [[serviceHref(service), service]];
  if (span.category === "http.server") links.push([endpointHref(`api:${span.service}`, endpointNameOf(span, "api")), "Endpoint"]);
  if (span.category === "db") links.push([queryHref(normalizeQuery(queryText(span))), "Query"]);
  if (error) links.push([errorHref(error.key), "Error"]);
  if (trace.logs.length) links.push([hrefTo("logs", [], { trace: trace.traceId }), "Request logs"]);
  return (
    <div className="wl-sp-links">
      {links.map(([href, text]) => (
        <a key={href} className="wl-path-chip" href={href}>{text}</a>
      ))}
    </div>
  );
}

/** Details of the selected span: facts, links, query, events, logs, and attributes. */
export function SpanPanel({ span, trace, onClose }: { span: Span; trace: Trace; onClose: () => void }) {
  const attrs = Object.entries(span.attributes).filter(([k]) => k !== "db.query.text" && k !== "wizelens.db.parameters");
  const logs = trace.logs.filter((l) => l.spanId === span.spanId);
  return (
    <aside className="wl-span-panel" aria-label="Span details">
      <div className="wl-sp-head">
        <h2 title={span.name}>{span.name}</h2>
        <button type="button" className="wl-icon-btn" onClick={onClose} aria-label="Close details">
          <X size={18} />
        </button>
      </div>
      <Facts span={span} trace={trace} />
      <SpanLinks span={span} trace={trace} />
      <SpanK8s attributes={span.attributes} />
      <Query span={span} />
      {span.events.length > 0 && <h3>Events</h3>}
      {span.events.map((e, i) => (
        <EventCard key={i} event={e} trace={trace} />
      ))}
      {logs.length > 0 && (
        <>
          <h3>Logs</h3>
          <ul className="wl-sp-logs">
            {logs.map((l, i) => (
              <li key={i}>
                <span className={`wl-lvl wl-lvl-${l.level}`}>{l.level}</span> {l.message}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Attributes</h3>
      <AttrTable entries={attrs} search />
    </aside>
  );
}
