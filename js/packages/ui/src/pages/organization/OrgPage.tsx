import { Building2, CreditCard, FolderKanban, Gauge, History, SlidersHorizontal, Tag } from "lucide-react";
import { type Host, useHost } from "../../data/host";
import { useRoute } from "../../routes";
import { PageHeader } from "../../ui/Panel";
import { type Section, SectionLayout } from "../../ui/Sections";
import { BillingSection } from "./BillingSection";
import { ChecksSection } from "./ChecksSection";
import { GeneralSection, PreferencesSection, ProjectsSection } from "./OrgSections";
import { canManage } from "./orgTypes";
import { RetentionSection } from "./RetentionSection";
import { TagsSettings } from "./TagsSettings";
import { type OrgState, useOrg } from "./useOrg";
import "../../styles/pages/settings.css";

/** The cloud's sections: projects, data, plan, and name. Owners and admins see projects and billing. */
function cloudSections(host: Host, { current, ctx, billing }: OrgState): Section[] {
  if (!current) return [];
  const { org } = current;
  const manage = canManage(org.role);
  const list: (Section | false)[] = [
    !!ctx && manage && { id: "projects", label: "Projects", icon: FolderKanban, count: ctx.data.projects.length, render: () => <ProjectsSection {...ctx} /> },
    { id: "retention", label: "Data retention", icon: History, render: () => <RetentionSection org={org} /> },
    { id: "checks", label: "Thresholds and hidden keys", icon: Gauge, render: () => <ChecksSection key={org.id} /> },
    host.has("tags") && { id: "tags", label: "Tags", icon: Tag, render: () => <TagsSettings /> },
    billing && manage && { id: "billing", label: "Billing", icon: CreditCard, render: () => <BillingSection key={org.id} org={org} /> },
    { id: "general", label: "General", icon: Building2, render: () => <GeneralSection org={org} /> },
  ];
  return list.filter((s): s is Section => !!s);
}

/** A hub or one service: retention and thresholds where the host keeps settings, tags, and your preferences. */
function localSections(host: Host): Section[] {
  const list: (Section | false)[] = [
    host.has("settings") && { id: "retention", label: "Data retention", icon: History, render: () => <RetentionSection org={null} /> },
    host.has("settings") && { id: "checks", label: "Thresholds and hidden keys", icon: Gauge, render: () => <ChecksSection /> },
    host.has("tags") && { id: "tags", label: "Tags", icon: Tag, render: () => <TagsSettings /> },
    { id: "preferences", label: "Preferences", icon: SlidersHorizontal, render: () => <PreferencesSection /> },
  ];
  return list.filter((s): s is Section => !!s);
}

/** The cloud's Organization page, or Settings on a hub or in a service: how data is kept and checked. */
export function OrgPage() {
  const host = useHost();
  const cloud = host.has("accounts");
  const state = useOrg(cloud);
  const { params } = useRoute();
  const org = state.current?.org;
  const subtitle = org ? `${org.name}: projects, how data is kept and checked, the plan, and the name.` : host.has("settings") ? "How this hub keeps and checks data, and how the dashboard looks for you." : "Tags, and how the dashboard looks for you.";
  return (
    <>
      <PageHeader title={cloud ? "Organization" : "Settings"} subtitle={subtitle} />
      {state.error && <div className="wl-banner wl-banner-error">{state.error}</div>}
      <SectionLayout page={cloud ? "organization" : "settings"} sections={cloud ? cloudSections(host, state) : localSections(host)} active={params[0]} />
    </>
  );
}
