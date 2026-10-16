import { TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { useHost, useRange } from "../../data/host";
import { type Theme, useTheme } from "../../data/prefs";
import { Select } from "../../ui/Controls";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { HubConnect } from "./HubConnect";
import { SourceSettings } from "./SourceSettings";
import "../../styles/pages/settings.css";

interface Option {
  setting: string;
  dotnet: string;
  node: string;
}

const OPTIONS: Option[] = [
  { setting: "Storage kind", dotnet: "Storage = WizeLensStorage.Sqlite | Memory", node: 'storage: "sqlite" | "memory"' },
  { setting: "Storage file", dotnet: "StoragePath", node: "storagePath" },
  { setting: "Max traces", dotnet: "MaxTraces", node: "maxTraces" },
  { setting: "Max age", dotnet: "MaxAge", node: "maxAgeMs" },
  { setting: "Slow query", dotnet: "SlowQueryMs", node: "slowQueryMs" },
  { setting: "N+1 threshold", dotnet: "NPlusOneThreshold", node: "nPlusOneThreshold" },
  { setting: "AI access (MCP)", dotnet: "EnableMcp", node: "enableMcp" },
  { setting: "Response bodies", dotnet: "CaptureResponseBody", node: "captureResponseBody" },
  { setting: "Hub", dotnet: "HubUrl, HubToken (or WIZELENS_HUB)", node: "hub, hubToken (or WIZELENS_HUB)" },
  { setting: "Project", dotnet: "Project (or WIZELENS_PROJECT)", node: "project (or WIZELENS_PROJECT)" },
  { setting: "Redacted keys", dotnet: "RedactKeys", node: "redactKeys" },
];

const OPTION_COLUMNS: Column<Option>[] = [
  { key: "setting", header: "Setting", cell: (o) => o.setting },
  { key: "dotnet", header: ".NET (AddWizeLens options)", cell: (o) => <code className="wl-mono wl-small">{o.dotnet}</code> },
  { key: "node", header: "Node (createWizeLens options)", cell: (o) => <code className="wl-mono wl-small">{o.node}</code> },
];

const THEMES: [Theme, string][] = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "Same as my system"],
];

function Preferences() {
  const [theme, setTheme] = useTheme();
  const [range, setRange] = useRange();
  const ranges = useHost().ranges.map((r): [TimeRange, string] => [r, TIME_RANGES[r].label]);
  return (
    <Panel title="Dashboard">
      <div className="wl-settings-prefs">
        <label>
          <span>Theme</span>
          <Select label="Theme" value={theme} options={THEMES} onChange={setTheme} />
        </label>
        <label>
          <span>Default time range</span>
          <Select label="Default time range" value={range} options={ranges} onChange={setRange} />
        </label>
      </div>
      <p className="wl-muted wl-small wl-settings-note">These choices are saved in this browser only.</p>
    </Panel>
  );
}

export function SettingsPage() {
  const data = useData();
  return (
    <>
      <PageHeader title="Settings" subtitle="How WizeLens is set up for each connected service, and your dashboard preferences." />
      <div className="wl-grid wl-grid-2-even">
        <Preferences />
        <Panel title="How to change these">
          <p className="wl-muted wl-settings-note">
            {data.info?.mode === "hub"
              ? "Service settings live in each app's code. Hub settings are start options: run wizelens-hub --help."
              : "Service settings live in your app code. Change the option, then restart the service."}
          </p>
        </Panel>
      </div>
      <HubConnect info={data.info} />
      <div className="wl-grid wl-grid-2-even">
        {data.sources.length === 0 ? <Panel><Empty title="No services connected yet" /></Panel> : data.sources.map((s) => <SourceSettings key={s.endpoint} source={s} />)}
      </div>
      <Panel flush title="Options">
        <Table columns={OPTION_COLUMNS} rows={OPTIONS} rowKey={(o) => o.setting} />
      </Panel>
    </>
  );
}
