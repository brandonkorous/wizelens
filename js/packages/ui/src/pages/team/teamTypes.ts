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

export const ROLE_OPTIONS: [Role, string][] = [
  ["viewer", "Viewer: reads data"],
  ["member", "Member: also alerts and shares"],
  ["admin", "Admin: also projects, keys, members"],
  ["owner", "Owner: everything"],
];

export const canManage = (role: Role | undefined) => role === "owner" || role === "admin";
