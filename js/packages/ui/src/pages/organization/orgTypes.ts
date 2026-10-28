import type { Project, Role } from "../../data/account";

export interface Member {
  memberId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  sinceMs: number;
}

export interface ApiKey {
  id: string;
  kind: "ingest" | "read" | "browser";
  name: string;
  prefix: string;
  projectIds: string[];
  /** What it may do; null for everything its kind allows. */
  scopes: string[] | null;
  createdMs: number;
  lastUsedMs: number | null;
  /** Null: never expires. */
  expiresMs: number | null;
  rotatedFrom: string | null;
  /** Browser keys: the sites whose pages may send with it. */
  origins: string[] | null;
  /** A secret key a public page sent with: the page's site and when. The cloud refused that data. */
  exposed?: { origin: string | null; timeMs: number } | null;
}

/** A member's or viewer's own role on one project; "none" hides the project from them. */
export type ProjectRole = "none" | "viewer" | "member" | "admin";

export interface ProjectRoleRow {
  projectId: string;
  userId: string;
  role: ProjectRole;
}

/** An open invite. Its id is the secret part of the invite link. */
export interface Invite {
  id: string;
  email: string;
  role: Role;
  expiresMs: number;
}

/** `GET api/orgs/<id>`. Invites and keys are empty for members and viewers. */
export interface OrgData {
  role: Role;
  members: Member[];
  projects: Project[];
  invites: Invite[];
  keys: ApiKey[];
  /** Empty for members and viewers. */
  projectRoles: ProjectRoleRow[];
}

export const ROLE_LABEL: Record<Role, string> = { viewer: "Viewer", member: "Member", admin: "Admin", owner: "Owner" };

/** What each role may do, for hints next to a role picker. */
export const ROLE_HELP: Record<Role, string> = {
  viewer: "Reads all data.",
  member: "Reads data, and makes alerts and share links.",
  admin: "Also manages projects, keys, members, and single sign-on.",
  owner: "Everything, including other owners and deleting the organization.",
};

export const ROLE_OPTIONS: [Role, string][] = (["viewer", "member", "admin", "owner"] as const).map((r) => [r, ROLE_LABEL[r]]);

export const canManage = (role: Role | undefined) => role === "owner" || role === "admin";
