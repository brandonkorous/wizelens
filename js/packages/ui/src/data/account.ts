import { useSyncExternalStore } from "react";
import type { OrgRole } from "@wizeworks/lens-core";
import { apiFetch } from "./api";
import type { AuthClient } from "./auth-client";
import { getScope, setProjectScope } from "./prefs";
import { provider } from "./provider";

export type Role = OrgRole;

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  /** Cloud: days log lines are kept, or null for the organization's retention. */
  logRetentionDays?: number | null;
}

export interface OrgWithProjects {
  id: string;
  name: string;
  slug: string;
  retentionDays: number;
  /** The plan; "unlimited" on a cloud without billing. */
  plan?: string;
  role: Role;
  projects: Project[];
}

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

/** `GET api/me` on a cloud host. `mail` false: emails only go to the cloud's log. */
export interface AccountState {
  signedIn: boolean;
  needsSetup: boolean;
  signup: "open" | "invite";
  mail: boolean;
  /** Some organization has single sign-on with a proven domain. */
  sso: boolean;
  /** The cloud bills through Stripe: plans, limits, and the Billing page show. */
  billing?: boolean;
  user?: AccountUser;
  sessionId?: string;
  orgs?: OrgWithProjects[];
  /** Organizations where this person is the last owner and others are members: they block deleting the account. */
  blockingOrgs?: string[];
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
  state = await apiFetch<AccountState>("./api/me");
  if (state.signedIn) pickProject(state);
  emit();
  if (state.signedIn) provider.refresh();
  return state;
}

let client: Promise<AuthClient> | null = null;

/** The Better Auth client, loaded on first use so hosts without accounts never fetch it. */
export const authClient = (): Promise<AuthClient> => (client ??= import("./auth-client").then((m) => m.authClient));

/** A refused Better Auth call: `code` is its error code, for example SESSION_NOT_FRESH. */
export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface AuthFail {
  status: number;
  statusText?: string;
  code?: string;
  message?: string;
}

/** Run one Better Auth call; its error becomes an AuthError with the server's message. */
export async function auth<T>(run: (c: AuthClient) => Promise<{ data: T; error: AuthFail | null }>): Promise<NonNullable<T>> {
  const { data, error } = await run(await authClient());
  if (error) throw new AuthError(error.status, error.code ?? "", error.message || error.statusText || `HTTP ${error.status}`);
  return data as NonNullable<T>;
}

/** Better Auth wants a sign-in from the last 15 minutes for this. */
export const isNotFresh = (e: unknown): boolean => e instanceof AuthError && (e.code === "SESSION_NOT_FRESH" || (e.status === 403 && /fresh/i.test(e.message)));

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function signOut(): Promise<void> {
  await auth((c) => c.signOut());
  await loadAccount();
}

const PENDING_INVITE = "wl-pending-invite";

/** The invite to open after the email link signs the person in. Local storage: the email link opens a new tab. */
export const pendingInvite = {
  get: (): string | null => {
    try {
      return localStorage.getItem(PENDING_INVITE);
    } catch {
      return null;
    }
  },
  set: (id: string | null): void => {
    try {
      if (id) localStorage.setItem(PENDING_INVITE, id);
      else localStorage.removeItem(PENDING_INVITE);
    } catch {
      // Storage can be off; the person then opens the invite link again.
    }
  },
};

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
