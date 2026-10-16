import { currentProject, useAccount } from "../../data/account";
import { useApi } from "../../data/useApi";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { AuditPanel, SharesPanel } from "./ActivityPanels";
import { KeysPanel } from "./KeysPanel";
import { MembersPanel } from "./MembersPanel";
import { OrgSettings, ProjectsPanel } from "./ProjectsPanel";
import { canManage, type OrgData } from "./teamTypes";

/** The organization of the selected project: members, projects, keys, shared links, and the audit log. */
export function TeamPage() {
  const current = currentProject(useAccount());
  const { data, error, reload } = useApi<OrgData>(current ? `./api/orgs/${current.org.id}` : null);
  if (!current) return <Panel><Empty title="No project selected" /></Panel>;
  const { org, project } = current;
  const manage = canManage(org.role);
  return (
    <>
      <PageHeader title="Team" subtitle={`${org.name} · your role: ${org.role}`} />
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {manage && <OrgSettings org={org} />}
      {data && <MembersPanel orgId={org.id} data={data} reload={reload} />}
      {data && manage && <ProjectsPanel orgId={org.id} data={data} reload={reload} />}
      {data && manage && <KeysPanel orgId={org.id} data={data} reload={reload} />}
      <SharesPanel projectId={project.id} />
      {manage && <AuditPanel orgId={org.id} />}
    </>
  );
}
