import { useState } from "react";
import { useHost } from "../../data/host";
import { hrefTo } from "../../routes";
import { CopyButton } from "../../ui/Badges";
import { Empty, Panel, TabBar } from "../../ui/Panel";
import { type Framework, FRAMEWORKS, SETUP } from "./setup-snippets";

/** The empty Rendering page: how to send page views, per frontend framework. */
export function RenderSetup({ loading }: { loading: boolean }) {
  const cloud = useHost().has("accounts");
  return (
    <Panel>
      <Empty title={loading ? "Loading page views…" : "No page views in this range"}>
        {!loading && (cloud ? <CloudSetup /> : <HubSetup />)}
      </Empty>
    </Panel>
  );
}

/** On the cloud, page views come with a key: the code for a self-hosted endpoint would send nothing. */
function CloudSetup() {
  return (
    <p>
      Page views come from the browser. A static site sends them with a browser key&apos;s script tag; an app with a WizeLens
      server SDK sends them with its key. Try a longer time range, or see how: <a href={hrefTo("connect", ["setup"])}>Setup steps</a>.
    </p>
  );
}

function HubSetup() {
  const [framework, setFramework] = useState<Framework>("react");
  const s = SETUP[framework];
  return (
    <div className="wl-render-setup">
      <p>Page views, render phases, and component timings come from the browser. Pick your frontend:</p>
      <TabBar<Framework> tabs={FRAMEWORKS} value={framework} onChange={setFramework} />
      <p>
        {s.intro} <code className="wl-mono">{s.label}</code> <CopyButton text={s.code} label="Copy" />
      </p>
      <pre className="wl-code">{s.code}</pre>
      <p className="wl-small">{s.note}</p>
    </div>
  );
}
