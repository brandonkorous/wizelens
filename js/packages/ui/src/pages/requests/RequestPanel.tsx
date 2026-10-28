import { useState } from "react";
import { X } from "lucide-react";
import type { RequestItem, Trace } from "@wizeworks/lens-core";
import { fmtDate, fmtMs, fmtTime } from "../../format";
import { setQuery } from "../../routes";
import { Badge, toneOfStatus } from "../../ui/Badges";
import { Panel, TabBar } from "../../ui/Panel";
import { PanelHeaders, PanelResponse } from "./PanelHttp";
import { PanelOverview } from "./PanelOverview";
import { PanelTrace } from "./PanelTrace";
import { rootServer, statusText } from "./spanInfo";
import { useOpenFocus } from "../../ui/useOpenFocus";

type Tab = "overview" | "headers" | "response" | "trace";

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["headers", "Headers"],
  ["response", "Response"],
  ["trace", "Trace"],
];

function Head({ r }: { r: RequestItem }) {
  const title = useOpenFocus<HTMLHeadingElement>(r.traceId);
  return (
    <>
      <div className="wl-side-head">
        <h2 ref={title} tabIndex={-1} className="wl-truncate" title={`${r.method} ${r.path}`}>
          {r.method} {r.path}
        </h2>
        <button type="button" className="wl-icon-btn wl-rq-close" onClick={() => setQuery({ trace: null })} aria-label="Close request details">
          <X size={18} />
        </button>
      </div>
      <div className="wl-side-meta">
        <span>
          {fmtTime(r.startMs)} • {fmtDate(r.startMs)}
        </span>
        <Badge tone={toneOfStatus(r.status)}>{statusText(r.status, r.aborted)}</Badge>
        <strong className="wl-rq-duration">{fmtMs(r.durationMs)}</strong>
      </div>
    </>
  );
}

/** Details of the selected request: overview, headers, response, and trace. */
export function RequestPanel({ r, trace }: { r: RequestItem; trace: Trace | undefined }) {
  const [tab, setTab] = useState<Tab>("overview");
  const server = rootServer(trace);
  return (
    <Panel className="wl-rq-side">
      <Head r={r} />
      <TabBar tabs={TABS} value={tab} onChange={setTab} />
      {tab === "overview" && <PanelOverview r={r} />}
      {tab === "headers" && <PanelHeaders r={r} server={server} />}
      {tab === "response" && <PanelResponse r={r} server={server} />}
      {tab === "trace" && <PanelTrace trace={trace} />}
    </Panel>
  );
}
