import type { ServiceInfo } from "@wizeworks/lens-core";
import { CopyButton } from "../../ui/Badges";
import { Panel } from "../../ui/Panel";

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
    <Panel title="Connect a service">
      <p className="wl-muted wl-settings-note">Set these on the service, then restart it. It keeps its own dashboard too.</p>
      <Snippet label="WizeLens add-on (.NET or Node)" text={`WIZELENS_HUB=${hubUrl}`} />
      <Snippet label="Group it in a project (optional)" text="WIZELENS_PROJECT=my-project" />
      <Snippet label="Any OpenTelemetry app (OTLP/HTTP)" text={`OTEL_EXPORTER_OTLP_ENDPOINT=${hubUrl}`} />
      <Snippet label="OTLP project (optional)" text="OTEL_RESOURCE_ATTRIBUTES=service.namespace=my-project" />
    </Panel>
  );
}

/** Cloud: every sender needs a key from the Team page. */
function ConnectToCloud({ url }: { url: string }) {
  return (
    <Panel title="Connect a service">
      <p className="wl-muted wl-settings-note">
        Make an ingest key on the <a href="#/team">Team page</a>, then set these on the service and restart it.
      </p>
      <Snippet label="WizeLens add-on (.NET or Node)" text={`WIZELENS_HUB=${url}`} />
      <Snippet label="Its ingest key" text="WIZELENS_HUB_TOKEN=wl_ik_..." />
      <Snippet label="Any OpenTelemetry app (OTLP/HTTP)" text={`OTEL_EXPORTER_OTLP_ENDPOINT=${url}`} />
      <Snippet label="OTLP key" text="OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer wl_ik_..." />
      <Snippet label="AI agents (MCP), with a read key" text={`${url}/_wizelens/mcp`} />
    </Panel>
  );
}

/** In-app: say where this service also sends its data. */
function SendsToHub({ hub }: { hub: string }) {
  return (
    <Panel title="Local hub">
      <p className="wl-settings-note">
        This service also sends its data to the hub at <code className="wl-mono">{hub}</code>.{" "}
        <a href={`${hub}/_wizelens/`} target="_blank" rel="noreferrer">
          Open the hub dashboard
        </a>{" "}
        to see every service in one place.
      </p>
    </Panel>
  );
}

export function HubConnect({ info }: { info: ServiceInfo | null }) {
  const base = new URL("../", window.location.href).href.replace(/\/$/, "");
  if (info?.mode === "hub") return <ConnectToHub hubUrl={base} />;
  if (info?.mode === "cloud") return <ConnectToCloud url={base} />;
  return info?.hub ? <SendsToHub hub={info.hub} /> : null;
}
