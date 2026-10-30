import { useState } from "react";
import type { SendState, ServiceInfo } from "@wizeworks/lens-core";
import { fmtAgo } from "../../format";
import { hrefTo } from "../../routes";
import { DotText } from "../../ui/Badges";
import { Panel } from "../../ui/Panel";
import { AddButton, SectionHead } from "../../ui/Sections";
import { canManage } from "../organization/orgTypes";
import type { OrgCtx } from "../organization/useOrg";
import { KeyForm, SENDING } from "./KeyForm";
import { hereUrl, Snippet } from "./Snippet";

/** Without a release, errors, release markers, and version compares have nothing to name; the add-on reads it from this variable. */
const ReleaseSnippet = () => <Snippet label="Its release, such as the git commit (errors and release markers name it)" text="WIZELENS_RELEASE=$GIT_SHA" />;
// The environment picker lists what each service reports: the framework's own setting, as the docs say.
const EnvSnippet = () => (
  <>
    <Snippet label="Its environment (Node: NODE_ENV; .NET: ASPNETCORE_ENVIRONMENT; OpenTelemetry: deployment.environment.name)" text="NODE_ENV=production" />
    <Snippet label="In production the add-on is off until this is set; then it sends only and serves no dashboard" text="WIZELENS_ENABLED=true" />
  </>
);

/** The last step on every host: restart, then find the service on the Services page. */
function RestartStep({ n }: { n: number }) {
  return (
    <Panel title={`${n}. Restart the service`}>
      <p className="wl-settings-note">
        It shows on the <a href={hrefTo("services")}>Services</a> page within a minute.
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
        <Snippet label="WizeLens add-on (.NET or Node)" text={`WIZELENS_ENDPOINT=${hubUrl}`} />
        <Snippet label="Group it in a project (optional)" text="WIZELENS_PROJECT=my-project" />
        <ReleaseSnippet />
        <EnvSnippet />
        <Snippet label="Any OpenTelemetry app (OTLP/HTTP)" text={`OTEL_EXPORTER_OTLP_ENDPOINT=${hubUrl}`} />
        <Snippet label="OTLP project (optional)" text="OTEL_RESOURCE_ATTRIBUTES=service.namespace=my-project" />
      </Panel>
      <RestartStep n={2} />
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
        <Snippet label="WizeLens add-on (.NET or Node)" text={`WIZELENS_ENDPOINT=${url}`} />
        <Snippet label="Its ingest key" text="WIZELENS_TOKEN=wl_ik_..." />
        <ReleaseSnippet />
        <EnvSnippet />
        <Snippet label="Any OpenTelemetry app (OTLP/HTTP)" text={`OTEL_EXPORTER_OTLP_ENDPOINT=${url}`} />
        <Snippet label="OTLP key" text="OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer wl_ik_..." />
      </Panel>
      <RestartStep n={3} />
    </>
  );
}

// Whether the hub takes this service's data: a failing send says why, so a missing key is not silent.
function SendStatus({ send }: { send: SendState }) {
  if (send.state === "ok") return <p className="wl-settings-note"><DotText tone="success">Sending</DotText> <span className="wl-muted">· last batch {fmtAgo(send.lastSentMs ?? Date.now())}</span></p>;
  if (send.state === "waiting") return <p className="wl-settings-note"><DotText tone="neutral">Waiting for the first batch</DotText></p>;
  return (
    <div className="wl-banner wl-banner-error" role="alert">
      Nothing is getting there. {send.reason} Traces stay in this app, and sending retries on its own.
    </div>
  );
}

/** In-app: say where this service also sends its data, and whether it gets there. */
function SendsTo({ to, send }: { to: string; send?: SendState }) {
  return (
    <>
      <SectionHead title="Sends to" />
      <Panel>
        {send && <SendStatus send={send} />}
        <p className="wl-settings-note">
          This service also sends its data to the hub or cloud at <code className="wl-mono">{to}</code>.{" "}
          <a href={`${to}/_wizelens/`} target="_blank" rel="noreferrer">
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
  const base = hereUrl();
  if (info?.mode === "hub") return <HubSteps hubUrl={base} />;
  if (info?.mode === "cloud") return <CloudSteps url={base} ctx={ctx} />;
  return info?.sendTo ? <SendsTo to={info.sendTo} send={info.send} /> : null;
}
