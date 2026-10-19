import { RotateCcw } from "lucide-react";
import { type LogLevel, LOG_LEVELS, type LogRow, type LogsModel, VOLUME_GROUPS } from "@wizeworks/lens-core";
import { fmtTime } from "../../format";
import { hrefTo, setQuery, traceHref } from "../../routes";
import { Badge, type Tone } from "../../ui/Badges";
import { Select } from "../../ui/Controls";
import { ListQueryBar } from "../../ui/ListQueryBar";
import { Check } from "../../ui/Field";
import { FilterChips } from "../../ui/FilterChips";
import { Empty, KeyValues, Panel } from "../../ui/Panel";
import { ServiceSelect } from "../../ui/ServiceSelect";
import { type Column } from "../../ui/Table";
import { TimeChart } from "../../ui/TimeChart";

const LEVEL_TONE: Record<LogLevel, Tone> = { trace: "neutral", debug: "neutral", info: "info", warn: "warning", error: "danger", critical: "danger" };

export const LevelBadge = ({ level }: { level: LogLevel }) => <Badge tone={LEVEL_TONE[level]}>{level}</Badge>;

const LEVEL_OPTIONS: [string, string][] = [["trace", "All levels"], ["debug", "Debug and up"], ["info", "Info and up"], ["warn", "Warnings and up"], ["error", "Errors and up"], ["critical", "Critical only"]];

/** Level (and that level only), service, text, and the category and trace a link or a click set. */
export function LogFilters({ stats }: { stats: LogsModel }) {
  const { filter, services } = stats;
  return (
    <section className="wl-panel wl-filters">
      <Select label="Minimum level" value={filter.minLevel} options={LEVEL_OPTIONS} onChange={(v) => setQuery({ level: v === "trace" ? null : v, page: null })} />
      <ServiceSelect value={filter.service} services={services} />
      <ListQueryBar value={filter.query} placeholder="Messages, categories, or trace IDs; or level:error service:api" />
      <Check label="This level only" disabled={filter.minLevel === "trace"} checked={!!filter.exact} onChange={(e) => setQuery({ exact: e.target.checked ? "1" : null, page: null })} />
      <button type="button" className="wl-btn" onClick={() => setQuery({ level: null, exact: null, category: null, trace: null, q: null, user: null, page: null })}>
        <RotateCcw aria-hidden="true" /> Reset
      </button>
      <FilterChips chips={[["Category", "category", filter.category ?? ""], ["Trace", "trace", filter.traceId ?? ""], ["User", "user", filter.user ?? ""]]} />
    </section>
  );
}

/** A log line's attributes and span, under its row. */
export function LogDetail({ row }: { row: LogRow }) {
  const attrs = Object.entries(row.attributes ?? {});
  return (
    <div className="wl-log-detail">
      {attrs.length === 0 ? <span className="wl-muted">No attributes.</span> : <KeyValues rows={attrs.map(([k, v]): [string, string] => [k, typeof v === "string" ? v : JSON.stringify(v)])} />}
      <a href={hrefTo("logs", [], { trace: row.traceId })} onClick={(e) => e.stopPropagation()}>All lines of this request</a>
    </div>
  );
}

const GROUP_COLOR: Record<string, string> = { info: "var(--wl-chart-bar)", warn: "var(--wl-amber)", error: "var(--wl-red)" };

export function LogVolumePanel({ stats }: { stats: LogsModel }) {
  const bars = VOLUME_GROUPS.map((g) => ({ label: g.label, color: GROUP_COLOR[g.key]!, values: stats.volume[g.key] ?? [] }));
  return (
    <Panel title="Log Volume">
      {stats.totalLines === 0 ? <Empty title="No log lines in this time range">Lines written through WizeLens loggers show up here.</Empty> : <TimeChart starts={stats.starts} bars={bars} height={180} />}
    </Panel>
  );
}

export const LOG_COLUMNS: Column<LogRow>[] = [
  { key: "time", header: "Time", className: "wl-nowrap", sort: (r) => r.timeMs, cell: (r) => fmtTime(r.timeMs) },
  { key: "level", header: "Level", sort: (r) => LOG_LEVELS.indexOf(r.level), cell: (r) => <LevelBadge level={r.level} /> },
  { key: "service", header: "Service", className: "wl-nowrap", cell: (r) => r.service },
  { key: "category", header: "Category", className: "wl-log-cat", cell: (r) => <button type="button" className="wl-link-btn wl-truncate" title={`Only ${r.category}`} onClick={(e) => (e.stopPropagation(), setQuery({ category: r.category, page: null }))}>{r.category}</button> },
  { key: "message", header: "Message", className: "wl-log-msg", cell: (r) => r.message },
  { key: "trace", header: "Request", className: "wl-log-trace", cell: (r) => <a href={traceHref(r.traceId, "logs")} title={r.traceId} onClick={(e) => e.stopPropagation()}>{r.traceName}</a> },
];
