import { useState } from "react";
import { CopyButton } from "../../ui/Badges";
import { Empty, Panel, TabBar } from "../../ui/Panel";
import { type Framework, FRAMEWORKS, SETUP } from "./setup-snippets";

/** The empty Rendering page: how to send page views, per frontend framework. */
export function RenderSetup({ loading }: { loading: boolean }) {
  const [framework, setFramework] = useState<Framework>("react");
  const s = SETUP[framework];
  return (
    <Panel>
      <Empty title={loading ? "Loading page views…" : "No page views in this range"}>
        {!loading && (
          <div className="wl-render-setup">
            <p>Page views, render phases, and component timings come from the browser. Pick your frontend:</p>
            <TabBar<Framework> tabs={FRAMEWORKS} value={framework} onChange={setFramework} />
            <p>
              {s.intro} <code className="wl-mono">{s.label}</code> <CopyButton text={s.code} label="Copy" />
            </p>
            <pre className="wl-code">{s.code}</pre>
            <p className="wl-small">{s.note}</p>
          </div>
        )}
      </Empty>
    </Panel>
  );
}
