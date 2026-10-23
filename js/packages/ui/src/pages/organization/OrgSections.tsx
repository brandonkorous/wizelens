import { useState } from "react";
import { TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import type { OrgWithProjects } from "../../data/account";
import { useHost, useRange } from "../../data/host";
import { type ClockChoice, type TimeZoneChoice, useClockPref, useTimeZonePref } from "../../data/period";
import { type Theme, useTheme } from "../../data/prefs";
import { FormRow, SelectField } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { AddButton, SectionHead } from "../../ui/Sections";
import { DeleteOrgPanel, OrgNameForm } from "./OrgPanels";
import { canManage, ROLE_LABEL } from "./orgTypes";
import { NewProjectForm, ProjectsPanel } from "./ProjectsPanel";
import type { OrgCtx } from "./useOrg";

const THEMES: [Theme, string][] = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "Same as my system"],
];

const ZONES: [TimeZoneChoice, string][] = [["local", "My computer's time zone"], ["utc", "UTC"]];
const CLOCKS: [ClockChoice, string][] = [["12", "12-hour (2:05 PM)"], ["24", "24-hour (14:05)"]];

/** How the dashboard looks and opens for you, saved in this browser. */
export function PreferencesSection() {
  const [theme, setTheme] = useTheme();
  const [range, setRange] = useRange();
  const [zone, setZone] = useTimeZonePref();
  const [clock, setClock] = useClockPref();
  const ranges = useHost().ranges.map((r): [TimeRange, string] => [r, TIME_RANGES[r].label]);
  return (
    <>
      <SectionHead title="Preferences" description="How the dashboard looks and opens for you. Saved in this browser only." />
      <Panel>
        <FormRow>
          <SelectField label="Theme" value={theme} options={THEMES} onChange={setTheme} />
          <SelectField label="Default time range" value={range} options={ranges} onChange={setRange} hint="Pages open with this range." />
        </FormRow>
        <FormRow>
          <SelectField label="Time zone" value={zone} options={ZONES} onChange={setZone} hint="Times and charts show in this zone." />
          <SelectField label="Clock" value={clock} options={CLOCKS} onChange={setClock} />
        </FormRow>
      </Panel>
    </>
  );
}

/** The organization's projects: add one, clear one's data, or delete one. */
export function ProjectsSection({ org, data, reload }: OrgCtx) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <SectionHead title="Projects" description="Each project keeps its own traces, logs, dashboards, and alerts. A trace that crosses projects still opens whole for people who can read both." action={<AddButton label="New project" open={adding} onOpen={() => setAdding(true)} />} />
      {adding && <NewProjectForm orgId={org.id} reload={reload} onClose={() => setAdding(false)} />}
      <ProjectsPanel orgId={org.id} data={data} reload={reload} />
    </>
  );
}

/** The organization's name and, for owners, deleting it. */
export function GeneralSection({ org }: { org: OrgWithProjects }) {
  return (
    <>
      <SectionHead title="General" description={`${org.name}. Your role: ${ROLE_LABEL[org.role].toLowerCase()}.`} />
      {canManage(org.role) && <OrgNameForm key={`name:${org.id}`} org={org} />}
      {org.role === "owner" && <DeleteOrgPanel key={`delete:${org.id}`} org={org} />}
    </>
  );
}
