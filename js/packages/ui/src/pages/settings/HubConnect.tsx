import type { ServiceInfo } from "@wizeworks/lens-core";
import { CopyButton } from "../../ui/Badges";
import { Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="wl-snippet">
      <span className="wl-muted wl-small">{label}</span>
      <code className="wl-mono wl-small">{text}</code>
      <CopyButton text={text} label={`Copy: ${label}`} />
    </div>
  );
}

/** How to send a service's data to this hub. */
function ConnectToHub({ hubUrl }: { hubUrl: string }) {
  return (
    <>
      <SectionHead title="Connect a service" description="Set these on the service, then restart it. It keeps its own dashboard too." />
      <Panel>
        <Snippet label="WizeLens add-on (.NET or Node)" text={`WIZELENS_HUB=${hubUrl}`} />
        <Snippet label="Group it in a project (optional)" text="WIZELENS_PROJECT=my-project" />
        <Snippet label="Any OpenTelemetry app (OTLP/HTTP)" text={`OTEL_EXPORTER_OTLP_ENDPOINT=${hubUrl}`} />
        <Snippet label="OTLP project (optional)" text="OTEL_RESOURCE_ATTRIBUTES=service.namespace=my-project" />
      </Panel>
    </>
  );
}

/** Cloud: every sender needs a key from the Team page. */
function ConnectToCloud({ url }: { url: string }) {
  return (
    <>
      <SectionHead title="Connect a service" description={<>Make an ingest key in <a href="#/team/keys">Team, API keys</a>, then set these on the service and restart it. In production, also set WIZELENS_ENABLED=true: the service then sends only and serves nothing.</>} />
      <Panel>
        <Snippet label="WizeLens add-on (.NET or Node)" text={`WIZELENS_HUB=${url}`} />
        <Snippet label="Its ingest key" text="WIZELENS_HUB_TOKEN=wl_ik_..." />
        <Snippet label="Any OpenTelemetry app (OTLP/HTTP)" text={`OTEL_EXPORTER_OTLP_ENDPOINT=${url}`} />
        <Snippet label="OTLP key" text="OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer wl_ik_..." />
        <Snippet label="AI agents (MCP), with a read key" text={`${url}/_wizelens/mcp`} />
      </Panel>
    </>
  );
}

/** In-app: say where this service also sends its data. */
function SendsToHub({ hub }: { hub: string }) {
  return (
    <>
      <SectionHead title="Sends to" />
      <Panel>
        <p className="wl-settings-note">
          This service also sends its data to the hub or cloud at <code className="wl-mono">{hub}</code>.{" "}
          <a href={`${hub}/_wizelens/`} target="_blank" rel="noreferrer">
            Open that dashboard
          </a>{" "}
          to see every service in one place.
        </p>
      </Panel>
    </>
  );
}

export function HubConnect({ info }: { info: ServiceInfo | null }) {
  const base = new URL("../", window.location.href).href.replace(/\/$/, "");
  if (info?.mode === "hub") return <ConnectToHub hubUrl={base} />;
  if (info?.mode === "cloud") return <ConnectToCloud url={base} />;
  return info?.hub ? <SendsToHub hub={info.hub} /> : null;
}
