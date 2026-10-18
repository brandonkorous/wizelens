import { currentProject, useAccount } from "../../data/account";
import { useApi } from "../../data/useApi";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { AuditPanel, SharesPanel } from "./ActivityPanels";
import { InvitesPanel } from "./InvitesPanel";
import { KeysPanel } from "./KeysPanel";
import { MembersPanel } from "./MembersPanel";
import { DeleteOrgPanel, NewOrgPanel } from "./OrgPanels";
import { OrgSettings, ProjectsPanel } from "./ProjectsPanel";
import { SsoPanel } from "./SsoPanel";
import { canManage, type OrgData } from "./teamTypes";

/** The organization of the selected project: members, invites, projects, keys, single sign-on, shared links, and the audit log. */
export function TeamPage() {
  const account = useAccount();
  const current = currentProject(account);
  const { data, error, reload } = useApi<OrgData>(current ? `./api/orgs/${current.org.id}` : null);
  if (!current) {
    return (
      <>
        <PageHeader title="Team" subtitle="You are not in an organization yet." />
        <Panel><Empty title="No project selected">Make an organization, or ask your team for an invite link.</Empty></Panel>
        <NewOrgPanel />
      </>
    );
  }
  const { org, project } = current;
  const manage = canManage(org.role);
  return (
    <>
      <PageHeader title="Team" subtitle={`${org.name} · your role: ${org.role}`} />
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {manage && <OrgSettings key={`settings:${org.id}`} org={org} />}
      {data && <MembersPanel orgId={org.id} me={account?.user?.id ?? ""} data={data} reload={reload} />}
      {data && manage && <InvitesPanel orgId={org.id} mail={account?.mail ?? false} data={data} reload={reload} />}
      {data && manage && <ProjectsPanel orgId={org.id} data={data} reload={reload} />}
      {data && manage && <KeysPanel orgId={org.id} data={data} reload={reload} />}
      {manage && <SsoPanel key={`sso:${org.id}`} orgId={org.id} />}
      <SharesPanel projectId={project.id} />
      {manage && <AuditPanel orgId={org.id} />}
      <NewOrgPanel />
      {org.role === "owner" && <DeleteOrgPanel key={`delete:${org.id}`} org={org} />}
    </>
  );
}
