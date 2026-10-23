import { currentProject, type OrgWithProjects, type Project, useAccount } from "../../data/account";
import { useApi } from "../../data/useApi";
import type { OrgData } from "./orgTypes";

/** The shown organization with its members, projects, invites, and keys: what Connect, People & access, and Organization share. */
export interface OrgCtx {
  org: OrgWithProjects;
  data: OrgData;
  me: string;
  mail: boolean;
  reload: () => void;
}

export interface OrgState {
  /** The shown organization and its one project (null under All projects); null without accounts or an organization. */
  current: { org: OrgWithProjects; project: Project | null } | null;
  /** Null until the organization's data loads. */
  ctx: OrgCtx | null;
  error: string | null;
  /** The cloud bills through Stripe. */
  billing: boolean;
}

/** The organization the dashboard shows, and its data once loaded. `on` false (no accounts) asks for nothing. */
export function useOrg(on: boolean): OrgState {
  const account = useAccount();
  const current = on ? currentProject(account) : null;
  const { data, error, reload } = useApi<OrgData>(current ? `./api/orgs/${current.org.id}` : null);
  const ctx = current && data ? { org: current.org, data, me: account?.user?.id ?? "", mail: account?.mail ?? false, reload } : null;
  return { current, ctx, error, billing: !!account?.billing };
}
