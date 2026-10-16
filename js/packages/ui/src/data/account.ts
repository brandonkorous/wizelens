import { useSyncExternalStore } from "react";
import { apiFetch, apiSend } from "./api";
import { getScope, setProjectScope } from "./prefs";
import { provider } from "./provider";

export type Role = "owner" | "admin" | "member" | "viewer";

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
}

export interface OrgWithProjects {
  id: string;
  name: string;
  slug: string;
  retentionDays: number;
  role: Role;
  projects: Project[];
}

/** `GET api/auth/state` on a cloud host. */
export interface AccountState {
  signedIn: boolean;
  needsSetup: boolean;
  signup: "open" | "invite";
  user?: { id: string; email: string; name: string };
  orgs?: OrgWithProjects[];
}

const listeners = new Set<() => void>();
let state: AccountState | null = null;

const emit = () => listeners.forEach((l) => l());

/** Keep the chosen project when it is still ours; else pick the first one. */
function pickProject(s: AccountState): void {
  const all = (s.orgs ?? []).flatMap((o) => o.projects);
  if (all.length && !all.some((p) => p.id === getScope().project)) setProjectScope(all[0]!.id);
}

/** Load who is signed in, then reload the data with the right project. */
export async function loadAccount(): Promise<AccountState> {
  state = await apiFetch<AccountState>("./api/auth/state");
  if (state.signedIn) pickProject(state);
  emit();
  if (state.signedIn) provider.refresh();
  return state;
}

/** Sign in, set up, sign up, or join: each answers with a session cookie. */
export async function authAction(path: "login" | "setup" | "signup", body: Record<string, string>): Promise<void> {
  await apiSend("POST", `./api/auth/${path}`, body);
  await loadAccount();
}

export async function signOut(): Promise<void> {
  await apiSend("POST", "./api/auth/logout");
  await loadAccount();
}

export function useAccount(): AccountState | null {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

/** The organization and project the dashboard shows now. */
export function currentProject(s: AccountState | null): { org: OrgWithProjects; project: Project } | null {
  const id = getScope().project;
  for (const org of s?.orgs ?? []) {
    const project = org.projects.find((p) => p.id === id);
    if (project) return { org, project };
  }
  return null;
}
