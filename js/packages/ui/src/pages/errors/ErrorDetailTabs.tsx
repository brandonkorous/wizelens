import { type ErrorEvent, errorText } from "@wizeworks/lens-core";
import type { StackSource } from "../../data/sourcemaps";
import { traceHref } from "../../routes";
import { CopyButton, DotText, toneOfStatus } from "../../ui/Badges";
import { Empty, KeyValues } from "../../ui/Panel";

export function StackTrace({ event }: { event: StackSource }) {
  const text = event.stack ?? errorText(event);
  const lines = text.split(/\r?\n/);
  return (
    <div className="wl-stack">
      <div className="wl-stack-copy">
        <CopyButton text={text} label="Copy stack trace" />
      </div>
      <ol>
        {lines.map((line, i) => (
          <li key={i}>
            <code>{line}</code>
          </li>
        ))}
      </ol>
      {!event.stack && <p className="wl-muted wl-small">No stack trace was recorded for this error.</p>}
    </div>
  );
}

export function RequestContext({ event }: { event: ErrorEvent }) {
  return (
    <KeyValues
      rows={[
        ["Method", event.method ?? "–"],
        ["Path", event.path ? <span className="wl-mono">{event.path}</span> : "–"],
        ["Status", event.status === null ? "–" : <DotText tone={toneOfStatus(event.status)}>{event.status}</DotText>],
        ["Service", event.service],
        ["User", event.user ?? "–"],
        ["User agent", event.userAgent ?? "–"],
        ["Trace", <a key="t" href={traceHref(event.traceId, "errors")} className="wl-mono">{event.traceId.slice(0, 16)}…</a>],
      ]}
    />
  );
}

export function ErrorTags({ event }: { event: ErrorEvent }) {
  const tags = [...event.tags, event.browser ? "browser" : "server", ...(event.critical ? ["critical"] : []), ...(event.bot ? ["bot"] : [])];
  if (tags.length === 0) return <Empty>No tags on this request.</Empty>;
  return (
    <div className="wl-chips">
      {tags.map((t) => (
        <span key={t} className={`wl-chip${t === "critical" ? " wl-chip-red" : " wl-chip-blue"}`}>
          {t}
        </span>
      ))}
    </div>
  );
}
