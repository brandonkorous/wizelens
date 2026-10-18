import type { ReactNode } from "react";
import type { ServiceInfo } from "@wizeworks/lens-core";
import type { Source } from "../../data/sources";
import { fmtCount, fmtDateTime, fmtMs } from "../../format";
import { Badge, CopyButton, DotText } from "../../ui/Badges";
import { KeyValues, Panel } from "../../ui/Panel";

const HOUR_MS = 60 * 60_000;

function fmtAge(ms: number): string {
  if (ms % (24 * HOUR_MS) === 0) return `${ms / (24 * HOUR_MS)} day${ms === 24 * HOUR_MS ? "" : "s"}`;
  if (ms >= HOUR_MS) return `${+(ms / HOUR_MS).toFixed(1)} hours`;
  return `${Math.round(ms / 60_000)} minutes`;
}

const onOff = (on: boolean | undefined): ReactNode => (on === undefined ? "–" : <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>);

function statusOf(s: Source): ReactNode {
  if (s.status === "ok") return <DotText tone="success">Connected</DotText>;
  if (s.status === "pending") return <DotText tone="neutral">Connecting…</DotText>;
  return <DotText tone="danger" colorText>Unreachable{s.error ? ` (${s.error})` : ""}</DotText>;
}

function mcpRow(s: Source, info: ServiceInfo): ReactNode {
  if (!info.mcp) return onOff(false);
  const url = `${s.endpoint}/mcp`;
  return (
    <span>
      {onOff(true)}{" "}
      <code className="wl-mono wl-small">{url}</code> <CopyButton text={url} label="Copy MCP URL" />
    </span>
  );
}

// How many traces the service keeps, so counts on the other pages are read right.
function samplingText(info: ServiceInfo): string {
  const sm = info.sampling;
  if (!sm) return "Every trace";
  const extra = [sm.keepErrors ? "every trace with an error" : null, sm.keepSlowMs !== null ? `every trace with a span of ${fmtMs(sm.keepSlowMs)} or more` : null].filter(Boolean);
  const pct = `${Number((sm.rate * 100).toFixed(2))}% of traces`;
  return extra.length ? `${pct}, plus ${extra.join(" and ")}` : pct;
}

function infoRows(s: Source, info: ServiceInfo): [ReactNode, ReactNode][] {
  const storage = info.storage;
  return [
    ["Status", statusOf(s)],
    ["Version", info.version],
    ["Runtime", info.runtime],
    ["Environment", info.environment ?? "–"],
    ["Host", info.host ?? "–"],
    ["Started", info.startedMs ? fmtDateTime(info.startedMs) : "–"],
    ["Storage", storage ? (storage.kind === "postgres" ? "Postgres" : storage.kind === "sqlite" ? "SQLite file (kept across restarts)" : "Memory only") : "–"],
    ["Max traces", storage ? (storage.maxTraces === undefined ? "No limit" : fmtCount(storage.maxTraces)) : "–"],
    ["Max age", storage ? fmtAge(storage.maxAgeMs) : "–"],
    ["Slow query", info.analysis ? `${fmtMs(info.analysis.slowQueryMs)} or more` : "–"],
    ["N+1 threshold", info.analysis ? `${info.analysis.nPlusOneThreshold} repeats` : "–"],
    ["AI access (MCP)", mcpRow(s, info)],
    ["Response bodies", onOff(info.captureResponseBody)],
  ];
}

export function SourceSettings({ source }: { source: Source }) {
  const info = source.info;
  const title = (
    <h2>
      {info?.service ?? source.endpoint}
      {source.self && <span className="wl-muted wl-small"> · this dashboard</span>}
    </h2>
  );
  return (
    <Panel title={title} action={<a className="wl-view-all wl-small wl-mono" href={`${source.endpoint}/`}>{source.endpoint}</a>}>
      {info ? <KeyValues rows={infoRows(source, info)} /> : <KeyValues rows={[["Status", statusOf(source)]]} />}
      {info?.redactKeys && (
        <>
          <div className="wl-section-title">Redacted keys</div>
          <p className="wl-muted wl-small wl-settings-note">Values whose key contains one of these words are stored as [redacted].</p>
          <div className="wl-chips">
            {info.redactKeys.map((k) => (
              <span key={k} className="wl-chip wl-mono">{k}</span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
