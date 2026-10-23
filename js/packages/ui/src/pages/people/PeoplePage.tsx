import { FileClock, IdCard, Link2, Plug, ShieldCheck, UserCog, Users } from "lucide-react";
import { useRoute } from "../../routes";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Section, SectionHead, SectionLayout } from "../../ui/Sections";
import { AppsPanel } from "../account/AppsPanel";
import { canManage } from "../organization/orgTypes";
import { type OrgState, useOrg } from "../organization/useOrg";
import { AccessSection } from "./AccessSection";
import { AuditSection } from "./AuditLog";
import { MembersSection } from "./MembersSection";
import { ScimSection } from "./ScimSection";
import { SharesSection } from "./SharesSection";
import { SsoSection } from "./SsoPanel";

const APPS = "AI apps people here connected with their own sign-in. Each reads only the projects its person picked.";

function sectionsOf({ current, ctx }: OrgState): Section[] {
  if (!current) return [];
  const { org, project } = current;
  const manage = canManage(org.role);
  const list: (Section | false)[] = [
    !!ctx && { id: "members", label: "Members", icon: Users, count: ctx.data.members.length, render: () => <MembersSection {...ctx} /> },
    !!ctx && manage && { id: "access", label: "Project access", icon: UserCog, render: () => <AccessSection ctx={ctx} /> },
    manage && { id: "sso", label: "Single sign-on", icon: ShieldCheck, render: () => <SsoSection key={org.id} orgId={org.id} /> },
    manage && { id: "scim", label: "User sync (SCIM)", icon: IdCard, render: () => <ScimSection key={org.id} orgId={org.id} plan={org.plan ?? ""} /> },
    manage && { id: "apps", label: "Connected apps", icon: Plug, render: () => <><SectionHead title="Connected apps" description={APPS} /><AppsPanel key={org.id} list={`./api/orgs/${org.id}/apps`} team /></> },
    { id: "links", label: "Shared links", icon: Link2, render: () => <SharesSection orgId={org.id} project={project} /> },
    manage && { id: "audit", label: "Audit log", icon: FileClock, render: () => <AuditSection orgId={org.id} org={ctx?.data ?? null} /> },
  ];
  return list.filter((s): s is Section => !!s);
}

/** Who can see what in the organization: members, project access, sign-in, connected apps, shared links, and the audit log. */
export function PeoplePage() {
  const state = useOrg(true);
  const { params } = useRoute();
  const org = state.current?.org;
  if (!org) return <Panel><Empty title="No organization">Make one from the organization menu at the top, or ask your team for an invite link.</Empty></Panel>;
  return (
    <>
      <PageHeader title="People & access" subtitle={`Who can see what in ${org.name}.`} />
      {state.error && <div className="wl-banner wl-banner-error">{state.error}</div>}
      <SectionLayout page="people" sections={sectionsOf(state)} active={params[0]} />
    </>
  );
}
