import { messageRows, type Trace } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { usePagedRows } from "../../ui/PagedRows";
import { Empty } from "../../ui/Panel";

/** Every message this trace sent or handled: which service, which queue, and how long it took. */
export function MessagesTab({ trace, onSelect }: { trace: Trace; onSelect: (spanId: string | null) => void }) {
  const rows = messageRows(trace.spans);
  const shown = usePagedRows(rows, { noun: "messages", key: "messages", reset: trace.traceId });
  if (rows.length === 0) return <Empty>No messages were sent or handled in this request.</Empty>;
  return (
    <>
      <div className="wl-table-wrap">
        <table className="wl-table">
          <thead>
            <tr>
              <th>Operation</th>
              <th>Queue</th>
              <th>Service</th>
              <th>Message id</th>
              <th className="wl-num">Duration</th>
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((m) => (
              <tr key={m.spanId} className={`wl-clickable${m.error ? " wl-row-error" : ""}`} onClick={() => onSelect(m.spanId)}>
                <td>
                  <span className="wl-cat wl-cat-messaging">{m.operation}</span>
                </td>
                <td className="wl-mono">{m.queue}</td>
                <td>{m.service}</td>
                <td className="wl-mono wl-muted">{m.messageId ?? "–"}</td>
                <td className="wl-num">{fmtMs(m.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.pager}
    </>
  );
}
