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
  kind: "ingest" | "read";
  name: string;
  prefix: string;
  projectIds: string[];
  createdMs: number;
  lastUsedMs: number | null;
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
