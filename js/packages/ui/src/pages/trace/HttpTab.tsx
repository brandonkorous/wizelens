import { useMemo } from "react";
import type { Span } from "@wizeworks/lens-core/internal";
import { fmtMs } from "../../format";
import { usePagedRows } from "../../ui/PagedRows";
import { Empty } from "../../ui/Panel";
import { badgesFor, FindingBadges, rowClass, ServiceChip, type TabProps } from "./tabParts";
import { pressable } from "../../ui/pressable";

const isHttp = (s: Span) => s.category === "http.client" || s.category === "http.server" || s.category === "browser";
const direction = (s: Span) => (s.category === "http.server" ? "IN" : s.category === "browser" ? "WEB" : "OUT");

function HttpRow({ span, props, kinds }: { span: Span; props: TabProps; kinds: ReturnType<typeof badgesFor> }) {
  const a = span.attributes;
  const status = a["http.response.status_code"];
  const target = String(a["url.full"] ?? a["http.route"] ?? a["url.path"] ?? span.name);
  return (
    <tr className={`wl-clickable ${rowClass(span, props)}`} {...pressable(() => props.onSelect(span.spanId))}>
      <td>
        <span className={`wl-cat wl-cat-${span.category.replace(".", "-")}`}>{direction(span)}</span>
      </td>
      <td data-label="Method" className="wl-mono">{String(a["http.request.method"] ?? "")}</td>
      <td data-label="URL / route" className="wl-mono wl-wrap">
        {target} <FindingBadges kinds={kinds.get(span.spanId)} />
      </td>
      <td data-label="Service">
        <ServiceChip service={span.service} trace={props.trace} />
      </td>
      <td data-label="Status" className={`wl-num${typeof status === "number" && status >= 400 ? " wl-text-error" : ""}`}>{status ?? "–"}</td>
      <td data-label="Duration" className="wl-num">{fmtMs(span.durationMs)}</td>
    </tr>
  );
}

export function HttpTab(props: TabProps) {
  const spans = props.trace.spans.filter(isHttp);
  const kinds = useMemo(() => badgesFor(props.findings), [props.findings]);
  const shown = usePagedRows(spans, { noun: "calls", key: "http", reset: props.trace.traceId });
  if (spans.length === 0) return <Empty>No HTTP activity in this request.</Empty>;
  return (
    <>
      <div className="wl-table-wrap">
        <table className="wl-table wl-table-cards">
          <thead>
            <tr>
              <th>Direction</th>
              <th>Method</th>
              <th>URL / route</th>
              <th>Service</th>
              <th className="wl-num">Status</th>
              <th className="wl-num">Duration</th>
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((s) => (
              <HttpRow key={s.spanId} span={s} props={props} kinds={kinds} />
            ))}
          </tbody>
        </table>
      </div>
      {spans.some((s) => s.category === "browser") && <p className="wl-chart-note">A page view (WEB) has no method or status: the browser does not report them for the page itself.</p>}
      {shown.pager}
    </>
  );
}
