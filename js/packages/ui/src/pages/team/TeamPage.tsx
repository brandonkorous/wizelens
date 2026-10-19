import { Building2, CreditCard, FileClock, FolderKanban, IdCard, KeyRound, Link2, Plug, ShieldCheck, Users } from "lucide-react";
import { currentProject, useAccount } from "../../data/account";
import { useApi } from "../../data/useApi";
import { useRoute } from "../../routes";
import { AppsPanel } from "../account/AppsPanel";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Section, SectionHead, SectionLayout } from "../../ui/Sections";
import { AuditSection, SharesSection } from "./ActivityPanels";
import { NewOrgPanel } from "./OrgPanels";
import { BillingSection } from "./BillingSection";
import { ScimSection } from "./ScimSection";
import { SsoSection } from "./SsoPanel";
import { KeysSection, OrgSection, PeopleSection, ProjectsSection, type TeamCtx } from "./TeamSections";
import { canManage, type OrgData } from "./teamTypes";

function sectionsOf(ctx: TeamCtx | null, current: NonNullable<ReturnType<typeof currentProject>>, billing: boolean): Section[] {
  const { org, project } = current;
  const manage = canManage(org.role);
  const list: (Section | false)[] = [
    !!ctx && { id: "people", label: "People", icon: Users, count: ctx.data.members.length, render: () => <PeopleSection {...ctx} /> },
    !!ctx && manage && { id: "projects", label: "Projects", icon: FolderKanban, count: ctx.data.projects.length, render: () => <ProjectsSection {...ctx} /> },
    !!ctx && manage && { id: "keys", label: "API keys", icon: KeyRound, count: ctx.data.keys.length, render: () => <KeysSection {...ctx} /> },
    manage && { id: "apps", label: "Connected apps", icon: Plug, render: () => <><SectionHead title="Connected apps" description="AI apps people here connected with their own sign-in. Each reads only the projects its person picked." /><AppsPanel key={org.id} list={`./api/orgs/${org.id}/apps`} team /></> },
    manage && { id: "sso", label: "Single sign-on", icon: ShieldCheck, render: () => <SsoSection key={org.id} orgId={org.id} /> },
    manage && { id: "scim", label: "SCIM", icon: IdCard, render: () => <ScimSection key={org.id} orgId={org.id} plan={org.plan ?? ""} /> },
    { id: "links", label: "Shared links", icon: Link2, render: () => <SharesSection projectId={project.id} projectName={project.name} /> },
    manage && { id: "audit", label: "Audit log", icon: FileClock, render: () => <AuditSection orgId={org.id} org={ctx?.data ?? null} /> },
    billing && manage && { id: "billing", label: "Billing", icon: CreditCard, render: () => <BillingSection key={org.id} org={org} /> },
    { id: "organization", label: "Organization", icon: Building2, render: () => <OrgSection org={org} /> },
  ];
  return list.filter((s): s is Section => !!s);
}

/** The organization of the selected project, one section at a time: people, projects, keys, apps, SSO, SCIM, links, audit, billing, and settings. */
export function TeamPage() {
  const account = useAccount();
  const current = currentProject(account);
  const { params } = useRoute();
  const { data, error, reload } = useApi<OrgData>(current ? `./api/orgs/${current.org.id}` : null);
  if (!current) {
    return (
      <>
        <PageHeader title="Team" subtitle="You are not in an organization yet." />
        <Panel><Empty title="No organization">Make one below, or ask your team for an invite link.</Empty></Panel>
        <NewOrgPanel />
      </>
    );
  }
  const ctx: TeamCtx | null = data ? { org: current.org, data, me: account?.user?.id ?? "", mail: account?.mail ?? false, reload } : null;
  return (
    <>
      <PageHeader title="Team" subtitle={`${current.org.name}: people, projects, keys, and access.`} />
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      <SectionLayout page="team" sections={sectionsOf(ctx, current, !!account?.billing)} active={params[0]} />
    </>
  );
}
