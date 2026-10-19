import { useState } from "react";
import { Plus } from "lucide-react";
import type { OrgWithProjects } from "../../data/account";
import { SectionHead } from "../../ui/Sections";
import { InviteForm, InvitesPanel } from "./InvitesPanel";
import { KeyForm, KeysPanel } from "./KeysPanel";
import { MembersPanel } from "./MembersPanel";
import { DeleteOrgPanel, NewOrgPanel, OrgSettings } from "./OrgPanels";
import { NewProjectForm, ProjectsPanel } from "./ProjectsPanel";
import { canManage, type OrgData } from "./teamTypes";

export interface TeamCtx {
  org: OrgWithProjects;
  data: OrgData;
  me: string;
  mail: boolean;
  reload: () => void;
}

/** A section's main button, hidden while its form is open. */
function AddButton({ label, open, onOpen }: { label: string; open: boolean; onOpen: () => void }) {
  if (open) return null;
  return <button type="button" className="wl-btn wl-btn-primary" onClick={onOpen}><Plus aria-hidden="true" /> {label}</button>;
}

/** Members and the invites that wait for an answer. */
export function PeopleSection({ org, data, me, mail, reload }: TeamCtx) {
  const [inviting, setInviting] = useState(false);
  const manage = canManage(data.role);
  return (
    <>
      <SectionHead title="People" description="Who can see this organization's data, and what each person may change." action={manage && <AddButton label="Invite someone" open={inviting} onOpen={() => setInviting(true)} />} />
      {inviting && <InviteForm orgId={org.id} mail={mail} reload={reload} onClose={() => setInviting(false)} />}
      <MembersPanel orgId={org.id} me={me} data={data} reload={reload} />
      {manage && data.invites.length > 0 && <InvitesPanel orgId={org.id} mail={mail} data={data} reload={reload} />}
    </>
  );
}

export function ProjectsSection({ org, data, reload }: TeamCtx) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <SectionHead title="Projects" description="Each project keeps its own traces, logs, dashboards, and alerts. Logs can be kept for more or less time than traces. A trace that crosses projects still opens whole for people who can read both." action={<AddButton label="New project" open={adding} onOpen={() => setAdding(true)} />} />
      {adding && <NewProjectForm orgId={org.id} reload={reload} onClose={() => setAdding(false)} />}
      <ProjectsPanel orgId={org.id} retentionDays={org.retentionDays} data={data} reload={reload} />
    </>
  );
}

export function KeysSection({ org, data, reload }: TeamCtx) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <SectionHead
        title="API keys"
        description="Ingest keys let an app send data to one project. Read keys let an AI agent or script read the projects you pick. Only a hash is kept, so a key is shown once."
        action={<AddButton label="New key" open={adding} onOpen={() => setAdding(true)} />}
      />
      {adding && <KeyForm orgId={org.id} data={data} reload={reload} onClose={() => setAdding(false)} />}
      <KeysPanel orgId={org.id} data={data} reload={reload} />
    </>
  );
}

/** Name, data retention, another organization, and (owners) deleting this one. */
export function OrgSection({ org }: { org: OrgWithProjects }) {
  const manage = canManage(org.role);
  return (
    <>
      <SectionHead title="Organization" description={`${org.name}. Your role: ${org.role}.`} />
      {manage && <OrgSettings key={`settings:${org.id}`} org={org} />}
      <NewOrgPanel />
      {org.role === "owner" && <DeleteOrgPanel key={`delete:${org.id}`} org={org} />}
    </>
  );
}
