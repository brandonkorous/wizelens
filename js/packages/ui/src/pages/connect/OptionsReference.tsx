import { Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

interface Option {
  setting: string;
  dotnet: string;
  node: string;
  env: string;
}

/** Every add-on option, as it is named in each stack. Kept in step with the README's configuration tables. */
const OPTIONS: Option[] = [
  { setting: "On or off", dotnet: "Enabled", node: "enabled", env: "WIZELENS_ENABLED" },
  { setting: "Dashboard (off: send-only)", dotnet: "Dashboard", node: "dashboard", env: "WIZELENS_DASHBOARD" },
  { setting: "Send to a hub or the cloud", dotnet: "HubUrl", node: "hub", env: "WIZELENS_HUB" },
  { setting: "Hub token or ingest key", dotnet: "HubToken", node: "hubToken", env: "WIZELENS_HUB_TOKEN" },
  { setting: "Project on a shared hub", dotnet: "Project", node: "project", env: "WIZELENS_PROJECT" },
  { setting: "Share of traces kept", dotnet: "Sampling.Rate", node: "sampling.rate", env: "WIZELENS_SAMPLE_RATE" },
  { setting: "Logs outside a request", dotnet: "Logs.Outside", node: "logs.outside", env: "WIZELENS_LOGS_OUTSIDE" },
  { setting: "Lowest level kept outside a request", dotnet: "Logs.MinLevel", node: "logs.minLevel", env: "WIZELENS_LOGS_MIN_LEVEL" },
  { setting: "Share of those lines kept (below warn)", dotnet: "Logs.SampleRate", node: "logs.sampleRate", env: "WIZELENS_LOGS_SAMPLE_RATE" },
  { setting: "Storage", dotnet: "Storage", node: "storage", env: "–" },
  { setting: "Storage file", dotnet: "StoragePath", node: "storagePath", env: "–" },
  { setting: "Traces kept", dotnet: "MaxTraces, MaxAge", node: "maxTraces, maxAgeMs", env: "–" },
  { setting: "Slow query", dotnet: "SlowQueryMs", node: "slowQueryMs", env: "–" },
  { setting: "N+1 threshold", dotnet: "NPlusOneThreshold", node: "nPlusOneThreshold", env: "–" },
  { setting: "AI access (MCP)", dotnet: "EnableMcp", node: "enableMcp", env: "–" },
  { setting: "Outgoing HTTP calls (fetch, node:http)", dotnet: "–", node: "instrumentFetch, instrumentHttp", env: "–" },
  { setting: "Response bodies", dotnet: "CaptureResponseBody", node: "captureResponseBody", env: "–" },
  { setting: "Metrics", dotnet: "CaptureMetrics", node: "captureMetrics", env: "–" },
  { setting: "Redacted keys", dotnet: "RedactKeys", node: "redactKeys", env: "–" },
  { setting: "Tags", dotnet: "Tags.Rules, Tags.DisableBuiltIns", node: "tags.rules, tags.disableBuiltIns", env: "–" },
];

const code = (text: string) => (text === "–" ? <span className="wl-muted">–</span> : <code className="wl-mono wl-small">{text}</code>);

const COLUMNS: Column<Option>[] = [
  { key: "setting", header: "Setting", cell: (o) => o.setting },
  { key: "dotnet", header: ".NET: AddWizeLens(o => …)", cell: (o) => code(o.dotnet) },
  { key: "node", header: "Node: createWizeLens({ … })", cell: (o) => code(o.node) },
  { key: "env", header: "Environment variable", cell: (o) => code(o.env) },
];

export function OptionsReference() {
  return (
    <Panel flush>
      <Table columns={COLUMNS} rows={OPTIONS} rowKey={(o) => o.setting} />
    </Panel>
  );
}
