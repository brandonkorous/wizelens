import type { ReactNode } from "react";
import type { ServiceInfo } from "@wizeworks/lens-core/internal";
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

interface Switches { hub?: string; dotnet: string; node: string; docs: string }

const MCP: Switches = { hub: "--mcp", dotnet: "o.Mcp = true", node: "mcp: true", docs: "https://wizelens.com/docs/ai-access/#on-your-own-machine" };
const BODIES: Switches = { dotnet: "o.CaptureResponseBody = true", node: "captureResponseBody: true", docs: "https://wizelens.com/docs/configuration/" };

/** "Off", with the option that turns it on for this kind of service, as the docs write it, and a link to them. */
function offHint(info: ServiceInfo, sw: Switches): ReactNode {
  const turnOn = info.mode === "hub" ? sw.hub : info.runtime.startsWith(".NET") ? sw.dotnet : info.runtime.startsWith("node") ? sw.node : undefined;
  return (
    <span>
      {onOff(false)} {turnOn && <>Turn it on with <code className="wl-mono wl-small">{turnOn}</code>. </>}
      <a href={sw.docs} target="_blank" rel="noreferrer">How</a>
    </span>
  );
}

function mcpRow(s: Source, info: ServiceInfo): ReactNode {
  if (!info.mcp) return offHint(info, MCP);
  const url = `${s.endpoint}/mcp`;
  return (
    <span>
      {onOff(true)}{" "}
      <code className="wl-mono wl-small">{url}</code> <CopyButton text={url} label="Copy MCP URL" />
    </span>
  );
}

// The option behind a row, as .NET and Node name it; the in-app dashboard shows settings, the code sets them.
const SET_WITH: Record<string, [string, string]> = {
  Storage: ["Storage", "storage"],
  "Max traces": ["MaxTraces", "maxTraces"],
  "Keeps data for": ["MaxAge", "maxAgeMs"],
  Sampling: ["Sampling.Rate", "sampling.rate"],
  "Slow query": ["SlowQueryMs", "slowQueryMs"],
  "N+1 threshold": ["NPlusOneThreshold", "nPlusOneThreshold"],
};

/** A row's value, plus the option that changes it for this service's stack. */
function withOption(info: ServiceInfo, row: string, value: ReactNode): ReactNode {
  const names = SET_WITH[row];
  const name = !names || info.mode !== "in-app" ? undefined : info.runtime.startsWith(".NET") ? names[0] : info.runtime.startsWith("node") ? names[1] : undefined;
  if (value === null || !name) return value;
  return <span>{value} <span className="wl-muted wl-small">· set with <code className="wl-mono">{name}</code></span></span>;
}

// How many traces the service keeps, so counts on the other pages are read right.
function samplingText(info: ServiceInfo): string {
  const sm = info.sampling;
  if (!sm) return "Every trace";
  const extra = [sm.keepErrors ? "every trace with an error" : null, sm.keepSlowMs !== null ? `every trace with a span of ${fmtMs(sm.keepSlowMs)} or more` : null].filter(Boolean);
  const pct = `${Number((sm.rate * 100).toFixed(2))}% of traces`;
  return extra.length ? `${pct}, plus ${extra.join(" and ")}` : pct;
}

// Rows a host does not report (the cloud has no host or N+1 setting of its own) are left out, not shown as dashes.
function infoRows(s: Source, info: ServiceInfo): [ReactNode, ReactNode][] {
  const storage = info.storage;
  const storageText = storage?.kind === "postgres" ? "Postgres (kept across restarts)" : storage?.kind === "sqlite" ? "SQLite file (kept across restarts)" : storage ? "Memory only" : null;
  const rows: [ReactNode, ReactNode | null][] = [
    ["Status", statusOf(s)],
    ["Version", info.version],
    ["Runtime", info.runtime],
    ["Environment", info.environment ?? null],
    ["Host", info.host ?? null],
    ["Started", info.startedMs ? fmtDateTime(info.startedMs) : null],
    ["Storage", storageText],
    ["Max traces", storage?.maxTraces !== undefined ? fmtCount(storage.maxTraces) : null],
    ["Keeps data for", storage ? fmtAge(storage.maxAgeMs) : null],
    ["Sampling", info.mode === "in-app" ? samplingText(info) : null],
    ["Slow query", info.analysis ? `${fmtMs(info.analysis.slowQueryMs)} or more` : null],
    ["N+1 threshold", info.analysis ? `${info.analysis.nPlusOneThreshold} repeats` : null],
    ["AI access (MCP)", mcpRow(s, info)],
    ["Response bodies", info.captureResponseBody === undefined ? null : info.captureResponseBody ? onOff(true) : offHint(info, BODIES)],
  ];
  return rows.filter((r): r is [ReactNode, ReactNode] => r[1] !== null).map(([k, v]) => [k, withOption(info, k as string, v)]);
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
