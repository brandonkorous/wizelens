import type { ReactNode } from "react";
import { entryServerSpan, findRootSpan, type ServiceInfo, type Trace, traceDurationOf } from "@wizeworks/lens-core";
import type { Source } from "../../data/sources";
import { fmtMs, fmtTime, fmtDate } from "../../format";
import { CopyButton, DotText } from "../../ui/Badges";
import { Empty, KeyValues, Panel } from "../../ui/Panel";
import { traceTone, tracePath } from "./RecentTraces";

/** The connected service that recorded the trace's root, else this dashboard's service. */
function infoFor(trace: Trace, sources: Source[]): ServiceInfo | null {
  const match = sources.find((s) => s.info?.service === trace.service);
  return (match ?? sources.find((s) => s.self))?.info ?? null;
}

function statusText(trace: Trace): string {
  const code = trace.rootStatusCode;
  if (code != null) return code >= 400 ? `${code} Error` : `${code} OK`;
  return trace.status === "error" ? "Error" : "OK";
}

/** Facts about one trace: ids, timing, request, and where it ran. */
export function TraceAttributes({ trace, sources }: { trace: Trace | null; sources: Source[] }) {
  if (!trace) return <Panel title="Trace Attributes"><Empty>No trace selected.</Empty></Panel>;
  const root = findRootSpan(trace.spans);
  const server = entryServerSpan(trace.spans);
  const info = infoFor(trace, sources);
  const ua = server?.attributes["user_agent.original"];
  const rows: [string, ReactNode][] = [
    ["Trace ID", <span className="wl-mono wl-small">{trace.traceId}</span>],
    ["Parent ID", root?.parentSpanId ?? "–"],
    ["Span Count", trace.spanCount],
    ["Start Time", `${fmtDate(trace.startMs)} ${fmtTime(trace.startMs)}`],
    ["Duration", fmtMs(traceDurationOf(trace))],
    ["Status", <DotText tone={traceTone(trace)}>{statusText(trace)}</DotText>],
    ["Method", trace.rootMethod ?? "–"],
    ["Path", tracePath(trace)],
    ["User Agent", ua == null ? "–" : String(ua)],
    ["Environment", info?.environment ?? "–"],
    ["Host", info?.host ?? "–"],
  ];
  return (
    <Panel title="Trace Attributes" action={<CopyButton text={JSON.stringify({ traceId: trace.traceId, rootName: trace.rootName, services: trace.services }, null, 2)} label="Copy attributes" />}>
      <KeyValues rows={rows} />
    </Panel>
  );
}
