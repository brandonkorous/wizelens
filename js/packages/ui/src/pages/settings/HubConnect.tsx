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
  if (info?.mode === "hub") return <ConnectToHub hubUrl={new URL("../", window.location.href).href.replace(/\/$/, "")} />;
  return info?.hub ? <SendsToHub hub={info.hub} /> : null;
}
