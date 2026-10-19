import { type ReactNode, useEffect, useMemo, useState } from "react";
import { analyzeTrace, type Finding, healthOf, insightsOf, type Trace, type TraceView, traceTiming } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { useHost } from "../../data/host";
import { hrefTo } from "../../routes";
import { Empty, Panel } from "../../ui/Panel";
import { FindingList } from "./FindingList";
import { ShareButton } from "./ShareButton";
import { TraceHeader } from "./TraceHeader";
import { type Tab, TraceTabs } from "./TraceTabs";
import { useTrace } from "./useTrace";

const tabOfFinding = (f: Finding): Tab =>
  f.kind === "n+1-http" ? "http" : f.kind === "error" ? "errors" : f.kind === "n+1-db" || f.kind === "duplicate-query" || f.kind === "slow-query" ? "sql" : "timeline";

/** Tab state that follows the link (`#/traces/<id>/sql`). With `linked`, the URL follows the open tab. */
function useTab(traceId: string, view: TraceView | undefined, linked: boolean): [Tab, (t: Tab) => void] {
  const [tab, setTabState] = useState<Tab>(view && view !== "insights" ? view : "timeline");
  useEffect(() => {
    if (view && view !== "insights") setTabState(view);
  }, [view]);
  const setTab = (t: Tab) => {
    setTabState(t);
    if (linked) history.replaceState(null, "", `#/traces/${traceId}/${t}`);
  };
  return [tab, setTab];
}

export interface TraceBodyProps {
  trace: Trace;
  view?: TraceView;
  loading?: boolean;
  onRefresh?: () => void;
  /** Shared links: no back link, no refresh, and the URL stays as it is. */
  shared?: boolean;
  actions?: ReactNode;
}

/** Header, insights, and the span tabs of one loaded trace. */
export function TraceBody({ trace, view, loading = false, onRefresh, shared = false, actions }: TraceBodyProps) {
  const [tab, setTab] = useTab(trace.traceId, view, !shared);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (view === "insights") document.getElementById("wl-insights")?.scrollIntoView({ block: "start" });
  }, [view]);
  // The host's own thresholds, so the trace page finds what its Insights page finds.
  const analysis = useData().info?.analysis;
  const findings = useMemo(() => analyzeTrace(trace, analysis ?? {}), [trace, analysis]);
  const timing = useMemo(() => traceTiming(trace), [trace]);
  const health = healthOf({ status: trace.rootStatusCode, error: trace.errorCount > 0, totalMs: timing.totalMs, insights: insightsOf(findings).length });
  const onFinding = (f: Finding) => {
    setHighlight(new Set(f.spanIds));
    setSelected(f.spanIds[0] ?? null);
    setTab(tabOfFinding(f));
  };
  const select = (spanId: string | null) => (setSelected(spanId), setHighlight(new Set()));
  return (
    <div className="wl-detail">
      <TraceHeader trace={trace} timing={timing} health={health} loading={loading} onRefresh={onRefresh} backHref={shared ? null : hrefTo("traces", [], { trace: trace.traceId })} actions={actions} />
      <div id="wl-insights">
        <FindingList findings={findings} onSelect={onFinding} />
      </div>
      <TraceTabs trace={trace} findings={findings} tab={tab} selected={selected} highlight={highlight} onTab={setTab} onSelect={select} />
    </div>
  );
}

/** The full trace page. `view` opens one part of it. */
export function TraceDetail({ traceId, view }: { traceId: string; view?: TraceView }) {
  const { trace, error, loading, reload } = useTrace(traceId);
  const sharing = useHost().has("sharing");
  if (!trace) {
    return (
      <Panel>
        <Empty title={`Trace ${traceId.slice(0, 12)}…`}>{error ?? "Loading trace…"}</Empty>
        {error && <a href={hrefTo("traces")}>Back to traces</a>}
      </Panel>
    );
  }
  return <TraceBody trace={trace} view={view} loading={loading} onRefresh={reload} actions={sharing ? <ShareButton traceId={traceId} /> : undefined} />;
}
