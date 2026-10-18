import { BookOpen, Plug, Server, SlidersHorizontal } from "lucide-react";
import { TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { useHost, useRange } from "../../data/host";
import { type Theme, useTheme } from "../../data/prefs";
import { useRoute } from "../../routes";
import { FormRow, SelectField } from "../../ui/Field";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Section, SectionHead, SectionLayout } from "../../ui/Sections";
import { HubConnect } from "./HubConnect";
import { OptionsReference } from "./OptionsReference";
import { SourceSettings } from "./SourceSettings";
import "../../styles/pages/settings.css";

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
    <>
      <SectionHead title="Dashboard" description="How this dashboard looks and opens for you. Saved in this browser only." />
      <Panel>
        <FormRow>
          <SelectField label="Theme" value={theme} options={THEMES} onChange={setTheme} />
          <SelectField label="Default time range" value={range} options={ranges} onChange={setRange} hint="Pages open with this range." />
        </FormRow>
      </Panel>
    </>
  );
}

/** What each mode calls the services on this page, and where their settings are changed. */
function servicesText(mode: string | undefined): { label: string; description: string } {
  if (mode === "cloud") return { label: "This cloud", description: "How this WizeLens Cloud is set up. Start options change it: run wizelens-cloud --help." };
  if (mode === "hub") return { label: "This hub", description: "How this hub is set up. Start options change it: run wizelens-hub --help." };
  return { label: "Services", description: "How WizeLens is set up in each service this dashboard reads. Settings live in each app's code: change one, then restart the service." };
}

/** Preferences, how to connect a service (hub and cloud), how each service is set up, and every add-on option. */
export function SettingsPage() {
  const data = useData();
  const { params } = useRoute();
  const mode = data.info?.mode;
  const services = servicesText(mode);
  const sections: Section[] = [
    { id: "dashboard", label: "Dashboard", icon: SlidersHorizontal, render: () => <Preferences /> },
    ...(mode === "hub" || mode === "cloud" || data.info?.hub ? [{ id: "connect", label: mode === "in-app" ? "Sends to" : "Connect a service", icon: Plug, render: () => <HubConnect info={data.info} /> }] : []),
    {
      id: "services",
      label: services.label,
      icon: Server,
      render: () => (
        <>
          <SectionHead title={services.label} description={services.description} />
          {data.sources.length === 0 ? <Panel><Empty title="No services connected yet" /></Panel> : <div className="wl-settings-sources">{data.sources.map((s) => <SourceSettings key={s.endpoint} source={s} />)}</div>}
        </>
      ),
    },
    { id: "options", label: "Add-on options", icon: BookOpen, render: () => <><SectionHead title="Add-on options" description="Every option of the .NET and Node add-ons, and the environment variable that sets it without a code change." /><OptionsReference /></> },
  ];
  return (
    <>
      <PageHeader title="Settings" subtitle="Your dashboard preferences, and how WizeLens is set up." />
      <SectionLayout page="settings" sections={sections} active={params[0]} />
    </>
  );
}
