import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ResolvedFrame, SourceContext } from "@wizeworks/lens-core";
import { type ResolvedStack, type StackSource, useResolvedStack } from "../../data/sourcemaps";
import { CopyButton } from "../../ui/Badges";
import { StackTrace } from "./ErrorDetailTabs";

type View = "original" | "raw";

const locationOf = (f: ResolvedFrame) => (f.source ? `${f.source}:${f.line}:${f.column}` : `${f.raw.url}:${f.raw.line}:${f.raw.column}`);
const originalText = (e: StackSource, frames: ResolvedFrame[]) => [`${e.type}: ${e.message}`, ...frames.map((f) => `    at ${f.fn ?? "<anonymous>"} (${locationOf(f)})`)].join("\n");

function SourceLines({ context, line }: { context: SourceContext; line: number | null }) {
  return (
    <pre className="wl-src">
      {context.lines.map((text, i) => {
        const n = context.start + i;
        return (
          <span key={n} className={n === line ? "wl-src-line wl-src-hit" : "wl-src-line"}>
            <span className="wl-src-no">{n}</span>
            <code>{text || " "}</code>
          </span>
        );
      })}
    </pre>
  );
}

function Frame({ frame, first }: { frame: ResolvedFrame; first: boolean }) {
  const [open, setOpen] = useState(first);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <li className={frame.inApp ? "wl-frame" : "wl-frame wl-frame-lib"}>
      <button type="button" className="wl-frame-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon aria-hidden="true" />
        <code className="wl-frame-fn">{frame.fn ?? "<anonymous>"}</code>
        <span className="wl-frame-loc">{locationOf(frame)}</span>
      </button>
      {open && frame.context && <SourceLines context={frame.context} line={frame.line} />}
      {open && <div className="wl-frame-raw">Raw: {frame.raw.raw}</div>}
    </li>
  );
}

function statusOf(r: ResolvedStack, release: string | null, resolved: boolean): string {
  if (r.loading) return "Reading source maps…";
  if (r.error) return `Source maps could not be read: ${r.error}`;
  if (resolved) return release ? `Source maps of release ${release}` : "Source maps";
  return `No source map found${release ? ` for release ${release}` : ""}. Showing the raw stack.`;
}

const MAPS_DOCS = "https://wizelens.com/docs/source-maps/#in-production-upload-at-build-time";

/** What to add so the stack shows the site's own files and lines. */
function MapHint() {
  return (
    <p className="wl-map-hint">
      This line is in your built, minified code. A source map turns it back into your own file and line. Add the WizeLens
      plugin to your build (for Vite: <code className="wl-mono">wizelensSourceMaps()</code> in vite.config.ts), and each
      build sends its maps.{" "}
      <a href={MAPS_DOCS} target="_blank" rel="noreferrer">
        Source maps, step by step
      </a>
    </p>
  );
}

/** A browser error's stack after source maps, with a few lines of source per frame; the raw stack one click away. */
export function ErrorStack({ event }: { event: StackSource }) {
  const r = useResolvedStack(event);
  const [view, setView] = useState<View>("original");
  if (!event.browser || !event.stack) return <StackTrace event={event} />;
  const frames = r.frames ?? [];
  const resolved = frames.some((f) => f.source !== null);
  const firstApp = frames.findIndex((f) => f.source !== null && f.inApp);
  return (
    <div className="wl-stack-box">
      <div className="wl-stack-head">
        <div className="wl-seg" role="tablist" aria-label="Stack view">
          {(["original", "raw"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "wl-active" : ""} disabled={v === "original" && !resolved} onClick={() => setView(v)}>
              {v === "original" ? "Original" : "Raw"}
            </button>
          ))}
        </div>
        <span className="wl-muted wl-small">{statusOf(r, event.release, resolved)}</span>
      </div>
      {!resolved && !r.loading && !r.error && <MapHint />}
      {view === "raw" || !resolved ? (
        <StackTrace event={event} />
      ) : (
        <div className="wl-stack wl-frames-box">
          <div className="wl-stack-copy">
            <CopyButton text={originalText(event, frames)} label="Copy original stack trace" />
          </div>
          <ol className="wl-frames">
            {frames.map((f, i) => (
              <Frame key={i} frame={f} first={i === firstApp} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
