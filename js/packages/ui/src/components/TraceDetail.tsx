import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzeTrace, type Finding, type Trace } from "@wizeworks/lens-core";
import { api } from "../api";
import { fmtClock, fmtMs, serviceSlot } from "../format";
import { Insights } from "./Insights";
import { SpanPanel } from "./SpanPanel";
import { ErrorsTab, HttpTab, LogsTab, SqlTab } from "./Tabs";
import { Waterfall } from "./Waterfall";

type Tab = "timeline" | "sql" | "http" | "logs" | "errors";

export function TraceDetail({ traceId }: { traceId: string }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("timeline");
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    api
      .trace(traceId)
      .then((t) => {
        setTrace(t);
        setError(null);
      })
      .catch((e: unknown) => setError(String(e).includes("not-found") ? "This trace is not in memory (it may have been dropped)." : String(e)))
      .finally(() => setLoading(false));
  }, [traceId]);

  useEffect(() => {
    setTrace(null);
    setSelected(null);
    setHighlight(new Set());
    load();
    // Browser spans and downstream services can land a moment later. Refresh once.
    const id = setTimeout(load, 1500);
    return () => clearTimeout(id);
  }, [load]);

  const findings = useMemo(() => (trace ? analyzeTrace(trace) : []), [trace]);
  const selectedSpan = trace?.spans.find((s) => s.spanId === selected) ?? null;

  const onFinding = (f: Finding) => {
    setHighlight(new Set(f.spanIds));
    setSelected(f.spanIds[0] ?? null);
    setTab(f.kind === "n+1-http" ? "http" : f.kind === "error" ? "errors" : f.kind === "n+1-db" || f.kind === "duplicate-query" || f.kind === "slow-query" ? "sql" : "timeline");
  };
  const select = (spanId: string) => {
    setSelected(spanId);
    setHighlight(new Set());
  };

  if (error && !trace) {
    return (
      <section className="panel">
        <a className="back" href="#/">
          ← All requests
        </a>
        <div className="empty">
          <strong>Trace {traceId.slice(0, 12)}…</strong>
          <span>{error}</span>
        </div>
      </section>
    );
  }
  if (!trace) return <div className="empty">Loading trace…</div>;

  const counts = {
    sql: trace.spans.filter((s) => s.category === "db").length,
    http: trace.spans.filter((s) => s.category === "http.client" || s.category === "http.server" || s.category === "browser").length,
    logs: trace.logs.length,
    errors: trace.errorCount,
  };

  return (
    <div className="detail">
      <section className="panel trace-head">
        <a className="back" href="#/">
          ← All requests
        </a>
        <div className="trace-title">
          <h1>
            {trace.status === "error" && <span className="status-dot error" aria-label="error" />}
            {trace.rootName}
          </h1>
          <button type="button" className="btn" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <dl className="stats">
          <div>
            <dt>Duration</dt>
            <dd>{fmtMs(trace.durationMs)}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{fmtClock(trace.startMs)}</dd>
          </div>
          <div>
            <dt>Spans</dt>
            <dd>{trace.spanCount}</dd>
          </div>
          <div>
            <dt>Queries</dt>
            <dd>{trace.dbCount}</dd>
          </div>
          <div>
            <dt>HTTP calls</dt>
            <dd>{trace.httpClientCount}</dd>
          </div>
          <div>
            <dt>Services</dt>
            <dd className="chips">
              {trace.services.map((s) => (
                <span key={s} className={`chip svc svc-${serviceSlot(s, trace.services)}`}>
                  {s}
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <div className="muted small mono">trace {trace.traceId}</div>
      </section>

      <Insights findings={findings} onSelect={onFinding} />

      <section className="panel">
        <nav className="tabs" role="tablist">
          {(
            [
              ["timeline", "Timeline", trace.spanCount],
              ["sql", "SQL", counts.sql],
              ["http", "HTTP", counts.http],
              ["logs", "Logs", counts.logs],
              ["errors", "Errors", counts.errors],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`tab ${tab === key ? "active" : ""} ${key === "errors" && count > 0 ? "tab-error" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
              <span className="tab-count">{count}</span>
            </button>
          ))}
        </nav>
        <div className="tab-body">
          <div className={`split ${selectedSpan ? "with-panel" : ""}`}>
            <div className="split-main">
              {tab === "timeline" && <Waterfall trace={trace} selected={selected} highlight={highlight} onSelect={select} />}
              {tab === "sql" && <SqlTab trace={trace} findings={findings} selected={selected} highlight={highlight} onSelect={select} />}
              {tab === "http" && <HttpTab trace={trace} findings={findings} selected={selected} highlight={highlight} onSelect={select} />}
              {tab === "logs" && <LogsTab trace={trace} onSelect={select} />}
              {tab === "errors" && <ErrorsTab trace={trace} onSelect={select} />}
            </div>
            {selectedSpan && <SpanPanel span={selectedSpan} trace={trace} onClose={() => setSelected(null)} />}
          </div>
        </div>
      </section>
    </div>
  );
}
