import { errorInfo, isErrorSpan, releaseOf, type Span, type Trace } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { usePagedRows } from "../../ui/PagedRows";
import { Empty } from "../../ui/Panel";
import { ErrorStack } from "../errors/ResolvedStack";
import { ServiceChip } from "./tabParts";

interface Props {
  trace: Trace;
  onSelect: (spanId: string) => void;
}

export function LogsTab({ trace, onSelect }: Props) {
  const shown = usePagedRows(trace.logs, { noun: "lines", key: "tracelogs", reset: trace.traceId });
  if (trace.logs.length === 0) return <Empty>No logs were written during this request.</Empty>;
  return (
    <>
      <div className="wl-table-wrap">
        <table className="wl-table">
          <thead>
            <tr>
              <th className="wl-num">At</th>
              <th>Level</th>
              <th>Service</th>
              <th>Category</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((l, i) => (
              <tr key={i} onClick={() => l.spanId && onSelect(l.spanId)} className={l.spanId ? "wl-clickable" : undefined}>
                <td className="wl-num wl-muted">+{fmtMs(l.timeMs - trace.startMs)}</td>
                <td>
                  <span className={`wl-lvl wl-lvl-${l.level}`}>{l.level}</span>
                </td>
                <td>
                  <ServiceChip service={l.service} services={trace.services} />
                </td>
                <td className="wl-muted wl-small">{l.category}</td>
                <td className="wl-wrap">{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.pager}
    </>
  );
}

// A browser error's stack opens on its original source (source maps), with the raw stack one click away.
function BrowserStack({ span }: { span: Span }) {
  const e = errorInfo(span);
  return (
    <div onClick={(ev) => ev.stopPropagation()}>
      <ErrorStack event={{ type: e.type ?? "Error", message: e.message, stack: e.stack, browser: true, release: releaseOf(span), traceId: span.traceId, spanId: span.spanId }} />
    </div>
  );
}

export function ErrorsTab({ trace, onSelect }: Props) {
  const spans = new Map(trace.spans.map((s) => [s.spanId, s]));
  const errors = trace.spans.filter(isErrorSpan).map(errorInfo);
  if (errors.length === 0) return <Empty>No errors in this request.</Empty>;
  return (
    <ul className="wl-error-list">
      {errors.map((e) => (
        <li key={e.spanId} className="wl-error-item" onClick={() => onSelect(e.spanId)}>
          <div className="wl-error-head">
            <ServiceChip service={e.service} services={trace.services} />
            <strong>{e.type ?? "Error"}</strong>
            <span className="wl-muted">in {e.name}</span>
          </div>
          <div className="wl-error-msg">{e.message}</div>
          {e.stack && spans.get(e.spanId)?.category === "browser" ? <BrowserStack span={spans.get(e.spanId)!} /> : e.stack && <pre className="wl-code wl-stack">{e.stack}</pre>}
        </li>
      ))}
    </ul>
  );
}
