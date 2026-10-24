import { useState } from "react";
import type { ServiceInfo } from "@wizeworks/lens-core";
import { hrefTo } from "../../routes";
import { CopyButton } from "../../ui/Badges";
import { Panel } from "../../ui/Panel";
import { AddButton, SectionHead } from "../../ui/Sections";
import { canManage } from "../organization/orgTypes";
import type { OrgCtx } from "../organization/useOrg";
import { KeyForm, SENDING } from "./KeyForm";

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="wl-snippet">
      <span className="wl-muted wl-small">{label}</span>
      <code className="wl-mono wl-small">{text}</code>
      <CopyButton text={text} label={`Copy: ${label}`} />
    </div>
  );
}

/** Without a release, errors, release markers, and version compares have nothing to name; the add-on reads it from this variable. */
const ReleaseSnippet = () => <Snippet label="Its release, such as the git commit (errors and release markers name it)" text="WIZELENS_RELEASE=$GIT_SHA" />;

/** The last step on every host: restart, then find the service on the Services page. */
function RestartStep({ n, cloud }: { n: number; cloud: boolean }) {
  return (
    <Panel title={`${n}. Restart the service`}>
      <p className="wl-settings-note">
        It shows on the <a href={hrefTo("services")}>Services</a> page within a minute.
        {cloud && " In production, also set WIZELENS_ENABLED=true: the service then sends only and serves nothing."}
      </p>
    </Panel>
  );
}

/** How to send a service's data to this hub: no key, only its address. */
function HubSteps({ hubUrl }: { hubUrl: string }) {
  return (
    <>
      <SectionHead title="Setup steps" description="Send a service's data to this hub. The service keeps its own dashboard too." />
      <Panel title="1. Set these on the service">
        <Snippet label="WizeLens add-on (.NET or Node)" text={`WIZELENS_HUB=${hubUrl}`} />
        <Snippet label="Group it in a project (optional)" text="WIZELENS_PROJECT=my-project" />
        <ReleaseSnippet />
        <Snippet label="Any OpenTelemetry app (OTLP/HTTP)" text={`OTEL_EXPORTER_OTLP_ENDPOINT=${hubUrl}`} />
        <Snippet label="OTLP project (optional)" text="OTEL_RESOURCE_ATTRIBUTES=service.namespace=my-project" />
      </Panel>
      <RestartStep n={2} cloud={false} />
    </>
  );
}

/** The first cloud step: make a sending key right here. Members and viewers ask an owner or admin. */
function KeyStep({ ctx }: { ctx: OrgCtx | null }) {
  const [making, setMaking] = useState(false);
  const manage = canManage(ctx?.data.role);
  return (
    <>
      <Panel title="1. Make a sending key" action={manage && <AddButton label="Make a sending key" onOpen={() => setMaking(true)} />}>
        <p className="wl-settings-note">
          An ingest key lets an app send to one project. A browser key lets a site with no WizeLens server send its page data.{" "}
          {manage ? <>Every key is listed under <a href={hrefTo("connect", ["keys"])}>Sending keys</a>.</> : "Ask an owner or admin of your organization for one."}
        </p>
      </Panel>
      {making && ctx && <KeyForm orgId={ctx.org.id} data={ctx.data} kinds={SENDING} reload={ctx.reload} onClose={() => setMaking(false)} />}
    </>
  );
}

/** Cloud: make a key, set it on the service with the address, then restart it. */
function CloudSteps({ url, ctx }: { url: string; ctx: OrgCtx | null }) {
  return (
    <>
      <SectionHead title="Setup steps" description="Send a service's data to WizeLens Cloud: make a key, set it on the service, and restart it." />
      <KeyStep ctx={ctx} />
      <Panel title="2. Set these on the service">
        <Snippet label="WizeLens add-on (.NET or Node)" text={`WIZELENS_HUB=${url}`} />
        <Snippet label="Its ingest key" text="WIZELENS_HUB_TOKEN=wl_ik_..." />
        <ReleaseSnippet />
        <Snippet label="Any OpenTelemetry app (OTLP/HTTP)" text={`OTEL_EXPORTER_OTLP_ENDPOINT=${url}`} />
        <Snippet label="OTLP key" text="OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer wl_ik_..." />
      </Panel>
      <RestartStep n={3} cloud />
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

/** The steps to send a service's data here: a hub needs its address, the cloud a key too; in-app, where it sends. */
export function SetupSteps({ info, ctx }: { info: ServiceInfo | null; ctx: OrgCtx | null }) {
  const base = new URL("../", window.location.href).href.replace(/\/$/, "");
  if (info?.mode === "hub") return <HubSteps hubUrl={base} />;
  if (info?.mode === "cloud") return <CloudSteps url={base} ctx={ctx} />;
  return info?.hub ? <SendsToHub hub={info.hub} /> : null;
}
