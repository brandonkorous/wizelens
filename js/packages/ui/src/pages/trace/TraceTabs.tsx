import type { Finding, Trace, TraceView } from "@wizeworks/lens-core";
import { HttpTab } from "./HttpTab";
import { MessagesTab } from "./MessagesTab";
import { ErrorsTab, LogsTab } from "./LogsErrorsTabs";
import { SpanPanel } from "./SpanPanel";
import { SqlTab } from "./SqlTab";
import { Waterfall } from "./Waterfall";

export type Tab = Exclude<TraceView, "insights">;

export interface TraceTabsProps {
  trace: Trace;
  findings: Finding[];
  tab: Tab;
  selected: string | null;
  highlight: ReadonlySet<string>;
  onTab: (t: Tab) => void;
  onSelect: (spanId: string | null) => void;
}

function counts(trace: Trace): [Tab, string, number][] {
  return [
    ["timeline", "Timeline", trace.spanCount],
    ["sql", "SQL", trace.spans.filter((s) => s.category === "db").length],
    ["http", "HTTP", trace.spans.filter((s) => s.category === "http.client" || s.category === "http.server" || s.category === "browser").length],
    ["messages", "Messages", trace.spans.filter((s) => s.category === "messaging").length],
    ["logs", "Logs", trace.logs.length],
    ["errors", "Errors", trace.errorCount],
  ];
}

function TabBody(p: TraceTabsProps) {
  const props = { trace: p.trace, findings: p.findings, selected: p.selected, highlight: p.highlight, onSelect: p.onSelect };
  if (p.tab === "sql") return <SqlTab {...props} />;
  if (p.tab === "http") return <HttpTab {...props} />;
  if (p.tab === "messages") return <MessagesTab trace={p.trace} onSelect={p.onSelect} />;
  if (p.tab === "logs") return <LogsTab trace={p.trace} onSelect={p.onSelect} />;
  if (p.tab === "errors") return <ErrorsTab trace={p.trace} onSelect={p.onSelect} />;
  return <Waterfall trace={p.trace} selected={p.selected} highlight={p.highlight} onSelect={p.onSelect} />;
}

/** Timeline, SQL, HTTP, logs, and errors of one trace, with the span panel beside them. */
export function TraceTabs(p: TraceTabsProps) {
  const span = p.trace.spans.find((s) => s.spanId === p.selected) ?? null;
  return (
    <section className="wl-panel wl-panel-flush">
      <nav className="wl-tabs" role="tablist">
        {counts(p.trace).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={p.tab === key}
            className={`wl-tab${p.tab === key ? " wl-active" : ""}${key === "errors" && count > 0 ? " wl-tab-error" : ""}`}
            onClick={() => p.onTab(key)}
          >
            {label}
            <span className="wl-tab-count">{count}</span>
          </button>
        ))}
      </nav>
      <div className={`wl-split${span ? " wl-with-panel" : ""}`}>
        <div className="wl-split-main">
          <TabBody {...p} />
        </div>
        {span && <SpanPanel span={span} trace={p.trace} onClose={() => p.onSelect(null)} />}
      </div>
    </section>
  );
}
