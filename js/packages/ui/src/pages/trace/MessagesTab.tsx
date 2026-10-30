import { messageRows, type Trace } from "@wizeworks/lens-core/internal";
import { fmtMs } from "../../format";
import { usePagedRows } from "../../ui/PagedRows";
import { Empty } from "../../ui/Panel";
import { breakable } from "../../ui/breakable";
import { pressable } from "../../ui/pressable";

/** Every message this trace sent or handled: what it was, which service, which queue, and how long it took. */
export function MessagesTab({ trace, onSelect }: { trace: Trace; onSelect: (spanId: string | null) => void }) {
  const rows = messageRows(trace.spans);
  const shown = usePagedRows(rows, { noun: "messages", key: "messages", reset: trace.traceId });
  if (rows.length === 0) return <Empty>No messages were sent or handled in this request.</Empty>;
  return (
    <>
      <div className="wl-table-wrap">
        <table className="wl-table wl-table-cards">
          <thead>
            <tr>
              <th>Operation</th>
              <th>Message</th>
              <th>Queue</th>
              <th>Service</th>
              <th>Message id</th>
              <th className="wl-num">Duration</th>
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((m) => (
              <tr key={m.spanId} className={`wl-clickable${m.error ? " wl-row-error" : ""}`} {...pressable(() => onSelect(m.spanId))}>
                <td>
                  <span className="wl-cat wl-cat-messaging">{m.operation}</span>
                </td>
                <td data-label="Message">{m.message ? <strong>{breakable(m.message)}</strong> : <span className="wl-muted">Not named</span>}</td>
                <td data-label="Queue" className="wl-mono">{m.queue}</td>
                <td data-label="Service">{m.service}</td>
                <td data-label="Message id" className="wl-mono wl-muted">{m.messageId ?? "–"}</td>
                <td data-label="Duration" className="wl-num">{fmtMs(m.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.pager}
    </>
  );
}
