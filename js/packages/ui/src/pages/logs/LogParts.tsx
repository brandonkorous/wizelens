import { RotateCcw } from "lucide-react";
import { type LogLevel, LOG_LEVELS, type LogRow, type LogsModel, VOLUME_GROUPS } from "@wizeworks/lens-core";
import { fmtTime } from "../../format";
import { setQuery, traceHref } from "../../routes";
import { Badge, type Tone } from "../../ui/Badges";
import { SearchInput, Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { type Column } from "../../ui/Table";
import { TimeChart } from "../../ui/TimeChart";

const LEVEL_TONE: Record<LogLevel, Tone> = { trace: "neutral", debug: "neutral", info: "info", warn: "warning", error: "danger", critical: "danger" };

export const LevelBadge = ({ level }: { level: LogLevel }) => <Badge tone={LEVEL_TONE[level]}>{level}</Badge>;

const LEVEL_OPTIONS: [string, string][] = [["trace", "All levels"], ["debug", "Debug and up"], ["info", "Info and up"], ["warn", "Warnings and up"], ["error", "Errors and up"], ["critical", "Critical only"]];

export function LogFilters({ stats }: { stats: LogsModel }) {
  const { filter, services } = stats;
  const serviceOptions: [string, string][] = [["", "All services"], ...services.map((s): [string, string] => [s, s])];
  return (
    <section className="wl-panel wl-filters">
      <Select label="Minimum level" value={filter.minLevel} options={LEVEL_OPTIONS} onChange={(v) => setQuery({ level: v === "trace" ? null : v, page: null })} />
      <Select label="Service" value={filter.service} options={serviceOptions} onChange={(v) => setQuery({ service: v, page: null })} />
      <SearchInput value={filter.query} placeholder="Search messages, categories, or trace IDs…" onChange={(v) => setQuery({ q: v, page: null })} />
      <button type="button" className="wl-btn" onClick={() => setQuery({ level: null, service: null, q: null, page: null })}>
        <RotateCcw aria-hidden="true" /> Reset
      </button>
    </section>
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
  { key: "category", header: "Category", className: "wl-log-cat", cell: (r) => <span className="wl-truncate" title={r.category}>{r.category}</span> },
  { key: "message", header: "Message", className: "wl-log-msg", cell: (r) => r.message },
  { key: "trace", header: "Request", className: "wl-log-trace", cell: (r) => <a href={traceHref(r.traceId, "logs")} title={r.traceId} onClick={(e) => e.stopPropagation()}>{r.traceName}</a> },
];
