import { useState } from "react";
import { Download, GitCompare } from "lucide-react";
import type { Trace } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { fmtMs, fmtTime, shortId } from "../../format";
import { hrefTo, navigate } from "../../routes";

/** Save the whole trace (spans, logs, attributes) as a JSON file. */
export function DownloadButton({ trace }: { trace: Trace }) {
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `trace-${trace.traceId}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" className="wl-btn" onClick={save} title="Download this trace as JSON">
      <Download aria-hidden="true" /> JSON
    </button>
  );
}

const TRACE_ID = /^[0-9a-f]{32}$/;

/** Pick another trace to compare with: a pasted id, or a recent trace with the same name. */
export function CompareButton({ trace }: { trace: Trace }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const { traces } = useData();
  const same = traces.filter((t) => t.rootName === trace.rootName && t.traceId !== trace.traceId).slice(0, 5);
  const go = (other: string) => navigate(hrefTo("trace", [trace.traceId, "compare", other]));
  return (
    <span className="wl-compare">
      <button type="button" className="wl-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <GitCompare aria-hidden="true" /> Compare
      </button>
      {open && (
        <div className="wl-menu wl-compare-menu">
          <form onSubmit={(e) => (e.preventDefault(), TRACE_ID.test(id.trim()) && go(id.trim()))}>
            <input className="wl-compare-input" value={id} onChange={(e) => setId(e.target.value)} placeholder="Paste a trace id" aria-label="Trace id to compare with" />
          </form>
          {same.length > 0 && <div className="wl-menu-head">Same request, newest</div>}
          {same.map((t) => (
            <button key={t.traceId} type="button" className="wl-menu-item" onClick={() => go(t.traceId)}>
              <span className="wl-mono">{shortId(t.traceId)}</span>
              <span className="wl-muted wl-small">{fmtTime(t.startMs)} · {fmtMs(t.durationMs)}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
