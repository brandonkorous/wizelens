import { useEffect, useMemo, useState } from "react";
import { analyzeTrace, type Finding, healthOf, insightsOf, type TraceView, traceTiming } from "@wizeworks/lens-core";
import { hrefTo } from "../../routes";
import { Empty, Panel } from "../../ui/Panel";
import { FindingList } from "./FindingList";
import { TraceHeader } from "./TraceHeader";
import { type Tab, TraceTabs } from "./TraceTabs";
import { useTrace } from "./useTrace";

const tabOfFinding = (f: Finding): Tab =>
  f.kind === "n+1-http" ? "http" : f.kind === "error" ? "errors" : f.kind === "n+1-db" || f.kind === "duplicate-query" || f.kind === "slow-query" ? "sql" : "timeline";

/** Tab state that follows the link (`#/traces/<id>/sql`) and keeps the URL on the open tab. */
function useTab(traceId: string, view: TraceView | undefined): [Tab, (t: Tab) => void] {
  const [tab, setTabState] = useState<Tab>(view && view !== "insights" ? view : "timeline");
  useEffect(() => {
    if (view && view !== "insights") setTabState(view);
  }, [view]);
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", `#/traces/${traceId}/${t}`);
  };
  return [tab, setTab];
}

/** The full trace page: header, insights, and the span tabs. `view` opens one part of it. */
export function TraceDetail({ traceId, view }: { traceId: string; view?: TraceView }) {
  const { trace, error, loading, reload } = useTrace(traceId);
  const [tab, setTab] = useTab(traceId, view);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const loaded = trace !== null;
  useEffect(() => {
    if (loaded && view === "insights") document.getElementById("wl-insights")?.scrollIntoView({ block: "start" });
  }, [loaded, view]);
  const findings = useMemo(() => (trace ? analyzeTrace(trace) : []), [trace]);
  const timing = useMemo(() => (trace ? traceTiming(trace) : null), [trace]);
  if (!trace || !timing) {
    return (
      <Panel>
        <Empty title={`Trace ${traceId.slice(0, 12)}…`}>{error ?? "Loading trace…"}</Empty>
        {error && <a href={hrefTo("traces")}>Back to traces</a>}
      </Panel>
    );
  }
  const health = healthOf({ status: trace.rootStatusCode, error: trace.errorCount > 0, totalMs: timing.totalMs, insights: insightsOf(findings).length });
  const onFinding = (f: Finding) => {
    setHighlight(new Set(f.spanIds));
    setSelected(f.spanIds[0] ?? null);
    setTab(tabOfFinding(f));
  };
  const select = (spanId: string | null) => (setSelected(spanId), setHighlight(new Set()));
  return (
    <div className="wl-detail">
      <TraceHeader trace={trace} timing={timing} health={health} loading={loading} onRefresh={reload} />
      <div id="wl-insights">
        <FindingList findings={findings} onSelect={onFinding} />
      </div>
      <TraceTabs trace={trace} findings={findings} tab={tab} selected={selected} highlight={highlight} onTab={setTab} onSelect={select} />
    </div>
  );
}
